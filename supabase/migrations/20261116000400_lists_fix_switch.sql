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
--               my_permissions, private.held_perms, viewed_perms, and R10's
--               area_rules and notify_role_change. Workers start without it,
--               and a role the business named follows its base until it has
--               a rule of its own.
--   earlier     every rule a business set for the lists before this gets a
--               rule for the key as the roles screen writes one now, where
--               fixing follows the role's own level of the lists: leaving
--               edit turns every switch of the area off, and a raise to
--               edit turns them on. Base managers lowered (a lists.manage
--               denial) are denied it, else the key's default would give
--               them a fix the owner never gave; base workers raised (a
--               lists.manage grant) are given it, so a role named on them
--               and lowered later is written a denial of its own, and
--               lowering and raising them again never hands it fixing. A
--               role named on either with a lists.manage rule of its own
--               gets the same rule for the key, whatever its base, so its
--               fixing follows its own level and never its base's (a row
--               the same as its base's rule only stops it following it).
--               Straight into the rules, as the seed writes them: what each
--               role holds stays as it was (at edit lists.manage already
--               fixes, and the new rules at view are denials), so nothing
--               goes to the log and nobody is told.
--   R10         a role's line counts lists.fix as held while the role runs
--               the lists (private.area_holds), as the roles screen draws it
--               ("כלול בעריכה", @domain/role-access): switching the key for
--               a role at edit, or for the base of a named role at edit,
--               changes nothing the role holds, so it tells nobody rather
--               than leave a line that says nothing. A line about the lists
--               from before this that a change still goes on from (unread,
--               unsettled, with its dedupe key) gets the key on each side,
--               held where that side ran the lists, as nobody fixed at view
--               then. Without it, private.notify_role_change would take the
--               key from just before the change, where it follows running
--               the lists as they stood then, and a role put back where its
--               line began would keep a line about a switch it never had.
--               Lines already read or settled are never gone on from, and
--               read the same either way: they stay as they were.
--   giving      someone who runs the lists counts as fixing them when they
--               invite to a role or move someone into one
--               (private.role_holds_beyond), as private.can_fix_list lets
--               them fix at any time: a role given lists.fix at view is
--               never beyond them.
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
-- lists.manage; private.role_holds_beyond
-- (20261115001600_named_roles_give.sql's), with a giver who runs the lists
-- counted as fixing them. Each keeps its signature, so its grants stay;
-- revoked again all the same. Their callers are unchanged:
-- public.set_list_item, set_list_item_photo, fix_list_item and
-- fix_list_item_photo, the lists' other readers of private.list_settings,
-- private.notify_role_change, and public.team_invite, team_invite_link and
-- set_member_role.
-- No rule by rank (tooling/role-checks.ts), and no new family in the log.

------------------------------------------------------------------------------
-- 1. The key

-- Fixing a closed list, at view: managers by default, owners always, owners
-- and the team switch it per role from the start.
insert into public.permission_keys (key, module_key, area, default_roles, by_owner, requires, settable)
values ('lists.fix', 'lists', 'lists', '{manager}'::public.member_role[], false, null, true);

-- Each rule for running the lists (lists.manage) set before the key came
-- gets a rule for it beside, as the roles screen writes one now, where
-- fixing follows the role's own level of the lists (leaving edit turns
-- every switch of the area off, a raise to edit turns them on):
--   a base role    with a lists.manage rule of its own that isn't the key's
--                  default for it: managers lowered are denied the key,
--                  else its default would give them a fix the owner never
--                  gave; workers raised are given it, so a role named on
--                  workers and lowered later is written a denial of its own
--                  (the roles screen writes a named role's rule only where
--                  it differs from its base's), and lowering workers and
--                  raising them again never hands that role fixing. One that
--                  is the default (managers at edit, workers at view) needs
--                  none.
--   a named role   with a lists.manage rule of its own: the same rule for
--                  the key, whatever its base's, so its fixing follows its
--                  own level of the lists and never its base's. A row the
--                  same as its base's rule only stops it following it there.
-- A rule already there for the key is left as it is. None of this changes
-- what any role holds: at edit lists.manage already fixes, at any time
-- (private.can_fix_list), and counts as fixing on a role's line
-- (private.area_holds, below); at view the new rules are denials, and nobody
-- fixed at view before the key came. So straight into the rules, as the seed
-- writes them, with who set the lists.manage rule: nothing is logged and
-- nobody is told (public.role_permissions has no trigger but the checks
-- that refuse pay, which isn't this key). Run once below, by this
-- migration; later the roles screen writes the key with the area. Returns
-- how many it added.
create function private.backfill_lists_fix()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  added integer;
begin
  insert into public.role_permissions (business_id, role, named_role, perm, allowed, granted_by)
  select rp.business_id, rp.role, rp.named_role, 'lists.fix', rp.allowed, rp.granted_by
  from public.role_permissions rp
  cross join public.permission_keys k
  where k.key = 'lists.fix'
    and rp.perm = 'lists.manage'
    and rp.role in ('manager', 'worker')
    and (
      rp.named_role is not null
      or rp.allowed is distinct from (rp.role = any (k.default_roles))
    )
    and not exists (
      select 1
      from public.role_permissions f
      where f.business_id = rp.business_id
        and f.role = rp.role
        and f.named_role is not distinct from rp.named_role
        and f.perm = 'lists.fix'
    )
  on conflict do nothing;
  get diagnostics added = row_count;

  return added;
end;
$$;

select private.backfill_lists_fix();

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

-- The lines about the lists written before the key came that a change of
-- the role still goes on from (private.notify_role_change: unread,
-- unsettled, found by their dedupe key) get the key on each side that lacks
-- it: held where that side ran the lists, as private.area_holds now counts
-- it, and not otherwise, as nobody fixed at view then. A line goes on from
-- where it began, with a key it lacks taken from just before the change,
-- where the key now follows running the lists as they stood then; with the
-- key there, a role put back where its line began takes the line away, as
-- before. Lines already read or settled are never gone on from (the next
-- change clears their dedupe key and begins a line of its own, with the
-- key) and read the same either way (areaChangeOf: at edit the switch is
-- included, at view a key a side lacks is off): they stay as they were.
-- Only `params` changes: no trigger reads an update of a line, and nothing
-- goes to a phone. Run once below, by this migration. Returns how many
-- lines it completed.
create function private.backfill_lists_fix_lines()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  completed integer;
begin
  update public.notifications n
  set params = n.params
    || (
      case
        when jsonb_typeof(n.params -> 'from') = 'object'
          and not ((n.params -> 'from') ? 'lists.fix')
          then jsonb_build_object(
            'from',
            (n.params -> 'from') || jsonb_build_object(
              'lists.fix',
              coalesce((n.params #> '{from,lists.manage}') = 'true'::jsonb, false)
            )
          )
        else '{}'::jsonb
      end
    )
    || (
      case
        when jsonb_typeof(n.params -> 'to') = 'object'
          and not ((n.params -> 'to') ? 'lists.fix')
          then jsonb_build_object(
            'to',
            (n.params -> 'to') || jsonb_build_object(
              'lists.fix',
              coalesce((n.params #> '{to,lists.manage}') = 'true'::jsonb, false)
            )
          )
        else '{}'::jsonb
      end
    )
  where n.kind = 'role.changed'
    and n.params ->> 'area' = 'lists'
    and n.dedupe_key is not null
    and n.read_at is null
    and n.resolved_at is null
    and (
      (
        jsonb_typeof(n.params -> 'from') = 'object'
        and not ((n.params -> 'from') ? 'lists.fix')
      )
      or (
        jsonb_typeof(n.params -> 'to') = 'object'
        and not ((n.params -> 'to') ? 'lists.fix')
      )
    );
  get diagnostics completed = row_count;

  return completed;
end;
$$;

select private.backfill_lists_fix_lines();

------------------------------------------------------------------------------
-- 6. Who a giver is beyond

-- 20261115001600_named_roles_give.sql's, with one rule more: a giver who
-- runs the lists (lists.manage) counts as fixing closed lists (lists.fix),
-- as private.can_fix_list lets them fix at any time and the roles screen
-- draws it at edit ("כלול בעריכה"), so a role given the switch at view is
-- never beyond them for it. Its callers, public.team_invite,
-- public.team_invite_link and public.set_member_role, are unchanged.
create or replace function private.role_holds_beyond(
  business uuid,
  r public.member_role,
  person uuid,
  named uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.permission_keys k
    where k.settable
      and private.role_holds(business, r, k.key, named)
      and not private.holds_perm(business, person, k.key)
      -- Fixing closed lists, which running them covers.
      and not (
        k.key = 'lists.fix'
        and private.holds_perm(business, person, 'lists.manage'::text)
      )
  )
$$;

------------------------------------------------------------------------------
-- Who may call what

-- New: they run inside the functions here and this migration, as their
-- owner, for nobody else.
revoke execute on function private.list_fix_hours(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.backfill_lists_fix()
  from public, anon, authenticated, service_role;
revoke execute on function private.backfill_lists_fix_lines()
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
revoke execute on function private.role_holds_beyond(uuid, public.member_role, uuid, uuid)
  from public, anon, authenticated;
