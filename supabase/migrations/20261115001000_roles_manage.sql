-- Roles and permissions by module, R7: the management page by its
-- permissions (the roles plan; Orel's answers of 15 November 2026, issue #1).
-- Who manages the business (its settings, its details, its departments, the
-- activity log) is whoever holds manage.view and manage.edit, where until now
-- it was owners and managers by role; and owners and the ConceptApp team now
-- switch both per role (permission_keys.settable): edit, view or none, since
-- the management page, unlike the four modules, can go down to none (Q2).
-- Nothing changes for anyone until they do: managers hold both by default,
-- workers neither, owners always both.
--
--   saving      private.can_edit_settings is the ConceptApp team, as before,
--               or whoever holds manage.edit. Its callers are unchanged:
--               public.set_module_settings (replaced below for its own
--               change), set_business_details, set_departments and
--               set_department_members, and the lists' template writers
--               (save_list_template, archive_list_template,
--               restore_list_template, next_list_openings), which accept
--               private.can_manage_lists or it: until the lists' phase (R5,
--               critique 4) moves them, manage.edit still includes the list
--               templates, and so their times, which open lists by
--               themselves (private.lists_tick). Who passes those functions
--               grows with it: a role raised to manage.edit saves, archives
--               and restores templates without lists.manage, as the roles
--               screen's hint says. R5 puts the team alone in place of each
--               of their `or private.can_edit_settings(…)`.
--   a module's  public.set_module_settings also asks, of anyone not on the
--   settings    ConceptApp team, the module's own edit (private.settings_perm:
--               schedule.edit, clock.edit, lists.manage, chat.moderate; none
--               for a module without an area of its own), so a role lowered
--               in scheduling no longer reshapes its positions and regular
--               shifts, whatever it holds here (critique 16). Owners hold
--               every key. The fields' levels (owner, team) are as before.
--   reading     the settings, the business's details and its departments are
--               read by every member, as before: none of those reads was by
--               role. The activity log is read at manage.view, each row also
--               by its own area (private.log_perm, critique 7): the clock's at
--               clock.edit; the schedule's, the swaps' and availability's at
--               schedule.edit; the lists' at lists.manage; invites', members',
--               the team's and profiles' at team.view; chat's at
--               chat.moderate; the management page's own (modules, the
--               business, departments, wording, role.permission,
--               permission.*, view_as.*) at manage.view alone; and a family
--               named nowhere there by no one, so a new one shows only once
--               it has an area (tooling/log-families.test.ts finds every
--               family the migrations write). The pay rows and documents'
--               stay the pay holders' alone, exactly as before. A view reads
--               as its role
--               holds by role (private.role_holds, as public.my_permissions
--               answers it), and never chat's or documents' rows, as before.
--               Both policies ask once per query (`(business_id, key) in
--               (select …)`: private.held_perms, private.viewed_perms), not
--               once per row as before. With today's defaults everyone reads
--               exactly what they read before.
--   the area    manage.view and manage.edit are settable: the console's roles
--               page (and, with R9, the owner's) switches them per role
--               (public.set_role_permission), every check of the area now
--               reading them.

------------------------------------------------------------------------------
-- 1. Who saves the business's settings

-- 20261107000500_module_settings.sql's (an active owner or manager, or the
-- ConceptApp team), by the permission rather than the role: the team, or
-- whoever holds manage.edit by private.holds_perm (an active owner always; on
-- the staff, by their role's rule for it while they also hold manage.view, or
-- by a grant of their own). Its callers are unchanged:
-- public.set_module_settings (20261110000700_pay_rules.sql's, replaced
-- below), public.set_business_details (20261107000600_business_details.sql),
-- public.set_departments and public.set_department_members
-- (20261109000600_lists.sql), and, beside private.can_manage_lists,
-- public.archive_list_template (20261109000600_lists.sql),
-- public.save_list_template, public.restore_list_template and
-- public.next_list_openings (20261110001300_list_schedules.sql), whose reach
-- grows with it until R5 moves them (critique 4).
create or replace function private.can_edit_settings(business uuid, person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.holds_perm(business, person, 'manage.edit'::text)
    or exists (
      select 1 from public.platform_staff s where s.user_id = person
    )
$$;

-- The permission a module's settings need besides manage.edit: the module's
-- own edit, as the roles screen draws each module's area (AREA_EDIT in
-- @domain/role-access; modules/permissions.db.test.ts keeps the two equal):
-- building the schedule, correcting hours, running the lists, moderating
-- chat. None for a module without an area of its own (notifications,
-- reservations, storefront), whose settings need manage.edit alone. Stable,
-- as it reads an enum's labels.
create function private.settings_perm(module public.module_key)
returns text
language sql
stable
set search_path = ''
as $$
  select case module::text
    when 'scheduling' then 'schedule.edit'::text
    when 'time_clock' then 'clock.edit'::text
    when 'lists' then 'lists.manage'::text
    when 'chat' then 'chat.moderate'::text
  end
$$;

-- 20261110000700_pay_rules.sql's, with one more check after who may touch
-- the business's settings at all: a module's own settings need, of anyone
-- not on the ConceptApp team, the module's own edit too
-- (private.settings_perm; 42501, hint 'module', the permission as its
-- detail). Owners hold every key. Its refusal for the rest is worded as
-- before (time_breaks.test.sql reads it). Its callers are unchanged:
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
-- 2. Who reads the activity log

-- The permission a row of the log is read with besides manage.view: its own
-- area's (critique 7). The clock's rows (who punched when, the corrections'
-- old and new times) for those who edit the clock; the schedule's, the
-- swaps' and availability's for those who build the schedule; the lists'
-- for those who run them; invites', members', the team's and profiles' for
-- those who see the team; chat's (a moderator's removal and its undo) for
-- its moderators; and the management page's own (module.*, business.*,
-- departments.*, wording.*, role.permission, permission.*, view_as.*) at
-- manage.view alone. A family named in none of them is null, read by no one
-- through the management page's side, so a new family shows to no area's
-- people until it is given its own here (tooling/log-families.test.ts fails
-- for a family the migrations write and this doesn't name). The pay rows and
-- documents' are the pay holders' (the policies below).
create function private.log_perm(what text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when what ~ '^clock\.' then 'clock.edit'::text
    when what ~ '^(schedule|swap|availability)\.' then 'schedule.edit'::text
    when what ~ '^lists\.' then 'lists.manage'::text
    when what ~ '^(invite|member|team|profile)\.' then 'team.view'::text
    when what ~ '^chat\.' then 'chat.moderate'::text
    when what ~ '^(module|business|departments|wording|role|permission|view_as)\.'
      then 'manage.view'::text
  end
$$;

-- Every permission the signed-in person holds as an active member, with its
-- business (private.holds_perm), for the policies' form `(business_id, key)
-- in (select …)`, which asks once per query rather than once per row.
create function private.held_perms()
returns table (business_id uuid, perm text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.business_id, k.key
  from public.memberships m
  cross join public.permission_keys k
  where m.user_id = (select auth.uid())
    and m.active
    and private.holds_perm(m.business_id, m.user_id, k.key)
$$;

-- Every permission the signed-in person's open view holds, with its business:
-- what the viewed role holds by role (private.role_holds: the business's row
-- for the role, else the key's default roles, with what each key requires),
-- every key for a view as the owner, and never a key an owner gives but as an
-- accountant, as public.my_permissions answers a view. In the same form.
create function private.viewed_perms()
returns table (business_id uuid, perm text)
language sql
stable
security definer
set search_path = ''
as $$
  select v.business_id, k.key
  from public.view_sessions v
  cross join public.permission_keys k
  where v.staff_id = (select auth.uid())
    and v.ended_at is null
    and v.expires_at > now()
    and (
      (v.role = 'accountant' and k.key = any (private.accountant_perms()))
      or (
        not k.by_owner
        and (v.role = 'owner' or private.role_holds(v.business_id, v.role, k.key))
      )
    )
$$;

-- 20261111000700_documents.sql's (managers by role read every row but the
-- pay rows and documents'; pay holders the pay rows, the clock's, the
-- permissions' and documents'), with the managers' side by permission: those
-- who hold manage.view read the rows whose own area they hold too
-- (private.log_perm), and the pay holders' side asked the same way. Renamed,
-- as it is no longer the managers'.
alter policy "managers read the log, pay holders the pay rows" on public.audit_log
  rename to "members read the log by area, pay holders the pay rows";
alter policy "members read the log by area, pay holders the pay rows" on public.audit_log
  using (
    (
      not private.is_pay_action(action)
      and action !~ '^document\.'
      and (business_id, 'manage.view'::text) in (
        select h.business_id, h.perm from private.held_perms() h
      )
      and (business_id, private.log_perm(action)) in (
        select h.business_id, h.perm from private.held_perms() h
      )
    )
    or (
      (business_id, 'clock.payroll'::text) in (
        select h.business_id, h.perm from private.held_perms() h
      )
      and (private.is_pay_action(action) or action ~ '^(clock|permission|document)\.')
    )
  );

-- 20261111000200_chat.sql's (never chat's or documents' rows; as an owner or
-- a manager every other row but the pay ones, as an accountant the pay, the
-- clock's and the permissions' rows), with the owners' and managers' side by
-- what the viewed role holds: manage.view, and each row's own area.
alter policy "a view reads the log as its role would" on public.audit_log
  using (
    not private.is_private_action(action)
    and (
      (
        not private.is_pay_action(action)
        and (business_id, 'manage.view'::text) in (
          select h.business_id, h.perm from private.viewed_perms() h
        )
        and (business_id, private.log_perm(action)) in (
          select h.business_id, h.perm from private.viewed_perms() h
        )
      )
      or (
        (business_id, 'clock.payroll'::text) in (
          select h.business_id, h.perm from private.viewed_perms() h
        )
        and (private.is_pay_action(action) or action ~ '^(clock|permission)\.')
      )
    )
  );

comment on table public.audit_log is
  'Append-only record of what changed in a business: written only by server functions, never changed but for its actor going when their account does, deleted only by a demo reset (private.purge_business_records). Read at manage.view, each row by its own area too (private.log_perm: the clock''s at clock.edit, the schedule''s, swaps'' and availability''s at schedule.edit, the lists'' at lists.manage, the team''s at team.view, chat''s at chat.moderate, the management page''s own at manage.view alone, a family named in none of them by no one there); pay rows (wage.*, payroll.*) and rows about documents (document.*) by pay holders only (clock.payroll); rows about chats and documents (chat.*, document.*) never by a view session.';

------------------------------------------------------------------------------
-- 3. The area opens

-- Every check of the management page now reads its two keys, so owners and
-- the team switch them per role.
update public.permission_keys k
set settable = true
where k.key in ('manage.view', 'manage.edit');

------------------------------------------------------------------------------
-- Who may call what

-- Replaced in place: the same signatures, so their grants stay; revoked (and
-- the setter's one granted) again all the same.
revoke execute on function private.can_edit_settings(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.set_module_settings(uuid, uuid, public.module_key, jsonb)
  from public, anon, authenticated;
grant execute on function public.set_module_settings(uuid, uuid, public.module_key, jsonb)
  to service_role;

-- Runs inside public.set_module_settings, as its owner.
revoke execute on function private.settings_perm(public.module_key)
  from public, anon, authenticated;

-- The policies' helpers run as the reader, so the signed-in role runs them;
-- each answers only for the reader.
revoke execute on function private.log_perm(text) from public, anon;
revoke execute on function private.held_perms() from public, anon;
revoke execute on function private.viewed_perms() from public, anon;
grant execute on function private.log_perm(text) to authenticated;
grant execute on function private.held_perms() to authenticated;
grant execute on function private.viewed_perms() to authenticated;
