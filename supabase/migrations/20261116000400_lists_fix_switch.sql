-- Lists: the switch 'תיקון רשימות שנסגרו' for any role (L6b-2 of the L6
-- plan; Orel's question of 16 November 2026: can a role such as 'עובד בכיר'
-- get the warehouse and kitchen lists every day, shared so that one person's
-- fill closes them for all, and fix them afterwards, with who changed what in
-- view). Until now only those who run the lists (lists.manage) fixed a
-- finished list (20261116000300_lists_fix.sql). Now owners and the
-- ConceptApp team switch a key of its own per role, lists.fix, the first that
-- works at view: a role that doesn't edit the lists fixes one that reached
-- it, for a while after it closed.
--
--   the key     lists.fix, in the lists area (modules/lists/manifest.ts;
--               modules/permissions.db.test.ts keeps the two the same), held
--               by managers by default and settable in the same statement: a
--               key of the area that owners can't switch would close the
--               whole area on the roles screen (areaOpen in
--               @domain/role-access). It requires nothing
--               (permission_keys.requires null): edit covers it, not the
--               chain (roles_changes.test.sql allows that): the roles screen
--               draws it held at edit and grants it with a raise to edit,
--               and private.can_fix_list lets lists.manage fix at any time.
--               Whatever reads the catalogue takes it by itself:
--               public.role_permission_matrix, set_role_permission(s),
--               my_permissions, private.held_perms, viewed_perms,
--               role_holds_beyond, and R10's area_rules and
--               notify_role_change. Workers start without it, and a role the
--               business named follows its base until it has a rule of its
--               own.
--   lowered     a role on managers that the business lowered on lists
--               before this (a lists.manage denial) gets lists.fix denied
--               too, the rule the roles screen writes when it lowers one
--               now: leaving edit turns every switch of the area off. Else
--               the key's default would give those managers a fix the owner
--               never gave. Base managers lowered get a denial of their own;
--               a role named on managers with a lists.manage denial of its
--               own gets one where its base would still give the key (a
--               named role keeps a row only where it differs from its base,
--               as public.set_role_permission keeps them). Straight into the
--               rules, as the seed writes them: no role's holding changes,
--               so nothing goes to the log and nobody is told.
--   R10         a role's line counts lists.fix as held while the role runs
--               the lists (private.area_holds), as the roles screen draws it
--               ("כלול בעריכה", @domain/role-access): switching the key for
--               a role at edit, or for the base of a named role at edit,
--               changes nothing the role holds, so it tells nobody rather
--               than leave a line that says nothing.
--   the window  fixHours, a setting of the lists module (owner level, as
--               the punch code is): how long after a list closed someone
--               given lists.fix may still fix it, 2, 12, 24 or 72 hours, 24
--               unless the business chose otherwise (Orel's default on Q2).
--               private.list_settings holds its default with the others
--               (modules/lists/settings.db.test.ts keeps the two the same);
--               private.list_fix_hours reads only a value the manifest
--               offers, anything else stored as 24, as the tick reads
--               tellOwnersAfterMinutes and readModuleSettings any setting.
--   who         private.can_fix_list: a finished list, by someone who runs
--               the lists, at any time, as before; or by someone given
--               lists.fix (private.holds_perm: their named role's rule, else
--               their base role's, else the key's default roles, or a grant
--               of their own), for a list that reaches them now
--               (private.holds_list: to them, their department, their shift,
--               their role or their named role), until fixHours after it
--               closed. Seeing every list stays edit's. A list passed to
--               another department since leaves its former holders: then
--               only those who run the lists fix it.
--   refused     past the window, someone given lists.fix who holds the list
--               hears why: 42501 with hint 'fix_window' (the app's fixOver:
--               someone who runs the lists can still fix it). Anyone else is
--               refused as before, 42501 with no hint. Reopening a list is as
--               it was (whoever finished it, within 5 minutes, or
--               lists.manage): lists.fix never reopens one.
--
-- It replaces, from their latest versions and with only these changes:
-- private.list_settings (20261115000500_lists_owners_late.sql's), with the
-- new default; private.can_fix_list, private.write_list_item and
-- private.write_list_item_photo (20261116000300_lists_fix.sql's), with the
-- window and its hint; private.area_holds
-- (20261115001700_roles_changes.sql's), with lists.fix held under
-- lists.manage. Each keeps its signature, so its grants stay; revoked again
-- all the same. Their callers are unchanged: public.set_list_item,
-- set_list_item_photo, fix_list_item and fix_list_item_photo, the lists'
-- other readers of private.list_settings, and private.notify_role_change.
-- No rule by rank (tooling/role-checks.ts), and no new family in the log.

------------------------------------------------------------------------------
-- 1. The key

-- Fixing a closed list, at view: managers by default, owners always, owners
-- and the team switch it per role from the start.
insert into public.permission_keys (key, module_key, area, default_roles, by_owner, requires, settable)
values ('lists.fix', 'lists', 'lists', '{manager}'::public.member_role[], false, null, true);

-- Managers lowered on lists before the key came (a lists.manage denial, base
-- or named) are denied it as well, as the roles screen denies it when it
-- lowers them now: base managers by a row of their own, first; then each
-- role named on managers with a lists.manage denial of its own, where its
-- base would still give the key (private.role_gives), so a named role keeps
-- a row only where it differs from its base. A role named on managers with
-- no denial of its own follows its base, lowered or not. A rule already
-- there for the key is left as it is. Straight into the rules, as the seed
-- writes them: what each role holds stays as it was, so nothing is logged
-- and nobody is told. Run once below, by this migration; later the roles
-- screen writes the key with the area. Returns how many it added.
create function private.backfill_lists_fix_denials()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  added integer;
  added_named integer;
begin
  insert into public.role_permissions (business_id, role, named_role, perm, allowed, granted_by)
  select rp.business_id, rp.role, null, 'lists.fix', false, rp.granted_by
  from public.role_permissions rp
  where rp.perm = 'lists.manage'
    and not rp.allowed
    and rp.role = 'manager'
    and rp.named_role is null
    and not exists (
      select 1
      from public.role_permissions f
      where f.business_id = rp.business_id
        and f.role = rp.role
        and f.named_role is null
        and f.perm = 'lists.fix'
    )
  on conflict do nothing;
  get diagnostics added = row_count;

  insert into public.role_permissions (business_id, role, named_role, perm, allowed, granted_by)
  select rp.business_id, rp.role, rp.named_role, 'lists.fix', false, rp.granted_by
  from public.role_permissions rp
  where rp.perm = 'lists.manage'
    and not rp.allowed
    and rp.role = 'manager'
    and rp.named_role is not null
    and not exists (
      select 1
      from public.role_permissions f
      where f.business_id = rp.business_id
        and f.role = rp.role
        and f.named_role = rp.named_role
        and f.perm = 'lists.fix'
    )
    and private.role_gives(rp.business_id, rp.role, 'lists.fix'::text, rp.named_role)
  on conflict do nothing;
  get diagnostics added_named = row_count;

  return added + added_named;
end;
$$;

select private.backfill_lists_fix_denials();

------------------------------------------------------------------------------
-- 2. The window

-- private.list_settings of 20261115000500_lists_owners_late.sql, with
-- fixHours (modules/lists/manifest.ts; modules/lists/settings.db.test.ts
-- keeps the two the same).
create or replace function private.list_settings(business uuid)
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
      'tellOwnersAfterMinutes', 60,
      'tellWhenFinished', true,
      'fixHours', 24,
      'photoDays', 90
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

-- How long after a list of `business` closed someone given lists.fix may
-- still fix it: fixHours as the manifest offers it (2, 12, 24 or 72 hours),
-- anything else stored as 24, the default. Its caller: private.can_fix_list.
create function private.list_fix_hours(business uuid)
returns interval
language sql
stable
security definer
set search_path = ''
as $$
  select make_interval(
    hours => case private.list_settings(business) -> 'fixHours'
      when '2'::jsonb then 2
      when '12'::jsonb then 12
      when '72'::jsonb then 72
      else 24
    end
  )
$$;

------------------------------------------------------------------------------
-- 3. Who may fix a finished list

-- 20261116000300_lists_fix.sql's, widened: a finished list, by someone who
-- runs the lists (lists.manage), at any time, as before; or by someone given
-- lists.fix (private.holds_perm) for a list that reaches them now
-- (private.holds_list), until the business's window after it closed
-- (private.list_fix_hours). Its callers check membership and the module
-- first.
create or replace function private.can_fix_list(l public.lists, actor uuid, at_time timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select l.status = 'finished'
    and (
      private.can_manage_lists(l.business_id, actor)
      or (
        private.holds_perm(l.business_id, actor, 'lists.fix'::text)
        and private.holds_list(l.id, actor)
        and at_time <= l.finished_at + private.list_fix_hours(l.business_id)
      )
    )
$$;

------------------------------------------------------------------------------
-- 4. Filling or fixing an item

-- 20261116000300_lists_fix.sql's, the same, with one refusal more: a fix
-- refused to someone given lists.fix who holds the list is refused for the
-- time alone (private.can_fix_list), so it says so (42501, hint
-- 'fix_window').
create or replace function private.write_list_item(
  actor uuid,
  item uuid,
  result jsonb,
  at_time timestamptz,
  fixing boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  it public.list_items%rowtype;
  l public.lists%rowtype;
  saved public.list_items%rowtype;
  new_checked boolean;
  new_reading numeric;
  new_answer text;
  new_given integer;
  new_comment text;
  is_done boolean;
  value_changed boolean;
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
  if fixing then
    -- How the list stands is said only to whoever could fill it or runs the
    -- lists, as filling says it; then its status (a list opened again
    -- meanwhile is filled, not fixed); then whether it is theirs to fix.
    if not (private.holds_list(l.id, actor) or private.can_manage_lists(l.business_id, actor)) then
      raise exception 'The list is not yours to fix' using errcode = '42501';
    end if;
    if l.status <> 'finished' then
      raise exception 'Only a finished list is fixed' using errcode = '55000';
    end if;
    if not private.can_fix_list(l, actor, at_time) then
      -- Given lists.fix and holding the list, only the time is past.
      if private.holds_perm(l.business_id, actor, 'lists.fix'::text)
        and private.holds_list(l.id, actor)
      then
        raise exception 'The time to fix the list is over'
          using errcode = '42501', hint = 'fix_window';
      end if;
      raise exception 'The list is not yours to fix' using errcode = '42501';
    end if;
  else
    if not (private.holds_list(l.id, actor) or private.can_manage_lists(l.business_id, actor)) then
      raise exception 'The list is not yours to fill' using errcode = '42501';
    end if;
    if l.status <> 'open' then
      raise exception 'The list is closed' using errcode = '55000';
    end if;
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
  value_changed := (new_checked, new_given, new_reading, new_answer)
    is distinct from (it.checked, it.given, it.reading, it.answer);

  -- A fix changes a required item or notes it, never empties it: every
  -- finished list keeps its required items done (public.finish_list).
  if fixing and it.required and not is_done then
    raise exception 'A required item of a finished list is changed, never emptied'
      using errcode = '23514', hint = 'required';
  end if;

  -- The same result again changes nothing and writes nothing. Who did it and
  -- when move only with its value.
  if value_changed or new_comment is distinct from it.comment then
    update public.list_items i
    set checked = new_checked,
      reading = new_reading,
      answer = new_answer,
      given = new_given,
      comment = new_comment,
      done = is_done,
      -- A fix keeps who did it and when while it stays done; one it makes
      -- done is the fixer's.
      done_by = case
        when it.kind = 'photo' or not value_changed then it.done_by
        when fixing and it.done and is_done then it.done_by
        when is_done then actor
      end,
      done_at = case
        when it.kind = 'photo' or not value_changed then it.done_at
        when fixing and it.done and is_done then it.done_at
        when is_done then at_time
      end,
      fixed_at = case when fixing then at_time else it.fixed_at end
    where i.id = item
    returning i.* into saved;

    perform private.record_item_change(it, saved, actor, at_time);

    -- A fix marks the list, and the log says what was and what is.
    if fixing then
      update public.lists x set fixed_at = at_time where x.id = l.id;

      insert into public.audit_log (business_id, actor_id, action, details)
      values (
        l.business_id, actor, 'lists.fix',
        jsonb_build_object(
          'list', l.id,
          'name', l.name,
          'item', it.id,
          'label', it.label,
          'kind', it.kind,
          'unit', it.unit,
          'changed', array_remove(array[
            case when saved.checked is distinct from it.checked then 'checked' end,
            case when saved.given is distinct from it.given then 'given' end,
            case when saved.reading is distinct from it.reading then 'reading' end,
            case when saved.answer is distinct from it.answer then 'answer' end,
            case when saved.comment is distinct from it.comment then 'comment' end
          ]::text[], null),
          'from', jsonb_build_object(
            'checked', it.checked, 'given', it.given, 'reading', it.reading
          ),
          'to', jsonb_build_object(
            'checked', saved.checked, 'given', saved.given, 'reading', saved.reading
          )
        )
      );
    end if;
  end if;

  -- Outside its range now, and it wasn't before: the list managers hear.
  if it.kind = 'number'
    and new_reading is not null
    and (
      (it.min_value is not null and new_reading < it.min_value)
      or (it.max_value is not null and new_reading > it.max_value)
    )
    and not coalesce(
      (it.min_value is not null and it.reading < it.min_value)
        or (it.max_value is not null and it.reading > it.max_value),
      false
    ) then
    insert into public.audit_log (business_id, actor_id, action, details)
    values (
      l.business_id, actor, 'lists.out_of_range',
      jsonb_build_object(
        'list', l.id,
        'item', it.id,
        'name', l.name,
        'label', it.label,
        'reading', new_reading,
        'min', it.min_value,
        'max', it.max_value,
        'unit', it.unit
      )
    );
  end if;

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

------------------------------------------------------------------------------
-- 5. A photo item's file

-- 20261116000300_lists_fix.sql's, the same, with the same refusal more: past
-- the window, someone given lists.fix who holds the list hears it (42501,
-- hint 'fix_window').
create or replace function private.write_list_item_photo(
  actor uuid,
  item uuid,
  new_path text,
  at_time timestamptz,
  fixing boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  it public.list_items%rowtype;
  l public.lists%rowtype;
  saved public.list_items%rowtype;
  replaced text;
begin
  select i.* into it from public.list_items i where i.id = item;
  if not found then
    raise exception 'Unknown item' using errcode = 'P0002';
  end if;
  -- The list first, as set_list_item locks it, so a finish waits for this.
  select x.* into l from public.lists x where x.id = it.list_id for update;
  if not exists (
    select 1 from public.memberships m
    where m.business_id = l.business_id and m.user_id = actor and m.active
  ) then
    raise exception 'Unknown item' using errcode = 'P0002';
  end if;
  perform private.lists_on(l.business_id);
  if fixing then
    -- How the list stands is said only to whoever could fill it or runs the
    -- lists, as filling says it; then its status (a list opened again
    -- meanwhile is filled, not fixed); then whether it is theirs to fix.
    if not (private.holds_list(l.id, actor) or private.can_manage_lists(l.business_id, actor)) then
      raise exception 'The list is not yours to fix' using errcode = '42501';
    end if;
    if l.status <> 'finished' then
      raise exception 'Only a finished list is fixed' using errcode = '55000';
    end if;
    if not private.can_fix_list(l, actor, at_time) then
      -- Given lists.fix and holding the list, only the time is past.
      if private.holds_perm(l.business_id, actor, 'lists.fix'::text)
        and private.holds_list(l.id, actor)
      then
        raise exception 'The time to fix the list is over'
          using errcode = '42501', hint = 'fix_window';
      end if;
      raise exception 'The list is not yours to fix' using errcode = '42501';
    end if;
  else
    if not (private.holds_list(l.id, actor) or private.can_manage_lists(l.business_id, actor)) then
      raise exception 'The list is not yours to fill' using errcode = '42501';
    end if;
    if l.status <> 'open' then
      raise exception 'The list is closed' using errcode = '55000';
    end if;
  end if;
  if it.kind <> 'photo' then
    raise exception 'Only a photo item takes a photo' using errcode = '22023';
  end if;
  if new_path is not null
    and new_path !~ ('^' || l.business_id::text || '/' || l.id::text || '/[a-z0-9-]{1,40}\.(webp|jpg)$')
  then
    raise exception 'A photo goes in its own list''s folder' using errcode = '22023';
  end if;

  select i.* into it from public.list_items i where i.id = item for update;
  if new_path is not distinct from it.photo_path then
    return null;
  end if;
  -- A fix replaces a required photo, never removes it.
  if fixing and it.required and new_path is null then
    raise exception 'A required item of a finished list is changed, never emptied'
      using errcode = '23514', hint = 'required';
  end if;
  replaced := case when it.photo_removed_at is null then it.photo_path end;

  update public.list_items i
  set photo_path = new_path,
    photo_removed_at = null,
    done = new_path is not null,
    -- A fix keeps who took it and when while it has one.
    done_by = case
      when fixing and it.done and new_path is not null then it.done_by
      when new_path is not null then actor
    end,
    done_at = case
      when fixing and it.done and new_path is not null then it.done_at
      when new_path is not null then at_time
    end,
    fixed_at = case when fixing then at_time else it.fixed_at end
  where i.id = item
  returning i.* into saved;

  perform private.record_item_change(it, saved, actor, at_time);

  -- A fix marks the list, and the log says so (a photo has no value to show).
  if fixing then
    update public.lists x set fixed_at = at_time where x.id = l.id;

    insert into public.audit_log (business_id, actor_id, action, details)
    values (
      l.business_id, actor, 'lists.fix',
      jsonb_build_object(
        'list', l.id,
        'name', l.name,
        'item', it.id,
        'label', it.label,
        'kind', it.kind,
        'unit', it.unit,
        'changed', array['photo']::text[],
        'from', jsonb_build_object(
          'checked', it.checked, 'given', it.given, 'reading', it.reading
        ),
        'to', jsonb_build_object(
          'checked', saved.checked, 'given', saved.given, 'reading', saved.reading
        )
      )
    );
  end if;

  return replaced;
end;
$$;

------------------------------------------------------------------------------
-- 5. What a role's line says it holds of the lists

-- 20261115001700_roles_changes.sql's, with one rule more: fixing closed
-- lists (lists.fix) is held while the role runs them (lists.manage, which
-- requires nothing), whatever its own rule for it, as the roles screen draws
-- it ("כלול בעריכה": @domain/role-access, holdsExtra) and the line's words
-- read it (areaChangeOf). So the key switched for a role at edit, or for the
-- base of a named role at edit that follows it there, moves nothing the
-- role holds, and tells nobody (private.notify_role_change). Its caller is
-- unchanged.
create or replace function private.area_holds(rules jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  -- Each key with everything it requires, however far down.
  with recursive chain (perm_key, need) as (
    select k.key, k.requires
    from public.permission_keys k
    where k.requires is not null
    union
    select c.perm_key, k.requires
    from chain c
    join public.permission_keys k on k.key = c.need
    where k.requires is not null
  )
  select coalesce(
    jsonb_object_agg(
      given.key,
      (
        given.value = 'true'::jsonb
          and not exists (
            select 1
            from chain c
            where c.perm_key = given.key
              and rules ? c.need
              and rules -> c.need is distinct from 'true'::jsonb
          )
      )
      -- Fixing closed lists, which running them covers.
      or (
        given.key = 'lists.fix'
        and rules -> 'lists.manage' = 'true'::jsonb
      )
    ),
    '{}'::jsonb
  )
  from jsonb_each(rules) as given (key, value)
$$;

------------------------------------------------------------------------------
-- Who may call what

-- New: they run inside the functions here and this migration, as their
-- owner, for nobody else.
revoke execute on function private.list_fix_hours(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.backfill_lists_fix_denials()
  from public, anon, authenticated, service_role;

-- Replaced in place, the same signatures: their grants stay as their first
-- migrations set them; revoked again all the same.
revoke execute on function private.list_settings(uuid) from public, anon, authenticated;
revoke execute on function private.can_fix_list(public.lists, uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke execute on function private.write_list_item(uuid, uuid, jsonb, timestamptz, boolean)
  from public, anon, authenticated, service_role;
revoke execute on function private.write_list_item_photo(uuid, uuid, text, timestamptz, boolean)
  from public, anon, authenticated, service_role;
revoke execute on function private.area_holds(jsonb)
  from public, anon, authenticated;
