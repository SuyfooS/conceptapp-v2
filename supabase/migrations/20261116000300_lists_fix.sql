-- Lists: fixing a closed list in place (L6b-1 of the L6 plan; Orel chose it
-- second on 16 November 2026, after each item's history). Until now a
-- finished list never changed: to correct a count or a reading someone who
-- runs the lists opened it again for everyone, which forgot who closed it and
-- when, told its people again that it waits, and could leave it open for
-- ever. Now those who run the lists fix it where it is.
--
--   in place    the list stays finished (Orel's default on Q1): finished_by,
--               finished_at and late_at don't change, nor the lists.finish
--               row with its 'late' flag. There is no lists.sent again, no
--               open-lists cap and nothing left open. Missed and cancelled
--               lists are not fixed, and a missed list stays missed.
--   explicit    a fix has functions of its own, public.fix_list_item and
--               fix_list_item_photo, for the server alone. public.set_list_item
--               and set_list_item_photo keep their signatures and still refuse
--               a finished list (55000), so a screen that is out of date never
--               turns a tick into a silent fix, and a fix of a list opened
--               again in the meantime is refused the same way. Both pairs run
--               over one body each, moved from 20261116000200_list_history.sql
--               into private.write_list_item and write_list_item_photo with a
--               `fixing` flag: not fixing, every rule is as it was.
--   who         private.can_fix_list: for now a finished list, and someone who
--               runs the lists (lists.manage), at any time. L6b-2 widens this
--               one place to a role's switch (lists.fix), for a list that
--               reaches them, within the business's window. Before its
--               status, a fix asks what filling asks (holding the list or
--               running the lists, 42501), so nobody else learns from it
--               whether a list is finished.
--   the item    changes in place. While it stays done, who did it and when
--               (done_by, done_at) stay: readings over time are counted by
--               done_at (@db/lists), so a reading fixed the next morning stays
--               on its own day. An optional item a fix makes done is the
--               fixer's, at the fix's time; one it empties is nobody's. A
--               required item is changed or noted, never emptied (23514, hint
--               'required'), so finish_list's rule still holds for every
--               finished list; a required photo is replaced, never removed.
--               To have it done again, someone who runs the lists opens the
--               list again for everyone (public.reopen_list), as before.
--   the marks   the history row is fixed (list_item_changes.fixed, set by
--               private.record_item_change: a change to a finished list), under
--               the fixer's name and time; the item's last fix is
--               list_items.fixed_at, the list's lists.fixed_at. An item or a
--               list reads as fixed while its fixed_at is after the list's
--               finished_at: a reopen and a new finish clear the mark without
--               touching the column.
--   the log     one row 'lists.fix' per change: the list, its name, the item,
--               its label, kind and unit, which fields changed, and from and
--               to (checked, given, reading). No text: the list is the record.
--               It tells nobody (private.notify_for_lists of
--               20261115001200_roles_lists.sql leaves an action it doesn't
--               name to its `else`), and it is read with the lists' rows by
--               those who run them (private.log_perm places `lists.`). A fix
--               that puts a reading out of its range still writes
--               lists.out_of_range and tells those who run the lists, as any
--               reading does.
--   nothing     a fix that changes nothing writes nothing: no row, no mark,
--               no log, as a save of the same result.
--
-- Replaced, with their grants as before: private.record_item_change,
-- public.set_list_item and public.set_list_item_photo
-- (20261116000200_list_history.sql), the last two now wrappers with the same
-- signatures. Their callers are unchanged: the app (@db/lists,
-- @db/list-photos), private.seed_demo_lists (20261115001200_roles_lists.sql),
-- e2e and the pgTAP files. Unchanged too: finish_list, reopen_list,
-- cancel_list, pass_list, send_list, the tick, notify_for_lists and the
-- history's guard and backfill.

------------------------------------------------------------------------------
-- 1. The marks

alter table public.list_item_changes add column fixed boolean not null default false;
alter table public.list_items add column fixed_at timestamptz;
alter table public.lists add column fixed_at timestamptz;

comment on column public.list_item_changes.fixed is
  'Whether the change was a fix of the finished list (public.fix_list_item or fix_list_item_photo), after its close. Set by private.record_item_change; false for every change before 16 November 2026 and for the backfill.';
comment on column public.list_items.fixed_at is
  'When the item was last fixed after its list closed (public.fix_list_item, fix_list_item_photo). It reads as fixed while this is after the list''s finished_at: a reopen and a new finish clear the mark without touching it.';
comment on column public.lists.fixed_at is
  'When an item of the finished list was last fixed (public.fix_list_item, fix_list_item_photo). The list reads as fixed while this is after its finished_at: a reopen and a new finish clear the mark without touching it. finished_by, finished_at and late_at stay as the close left them.';
comment on table public.list_item_changes is
  'What happened to each list item: one row per real change, by whom and when, naming which of checked, given, reading, answer, comment and photo changed, with the item after it (earlier answers and comments stay; earlier photos are not kept, only that there was one), and whether it was a fix after the list closed. Written only by public.set_list_item, set_list_item_photo, fix_list_item and fix_list_item_photo; read by whoever reads the list; never changed but for its person going when their account does; deleted only with its list. Items done before 16 November 2026 have one backfilled row, by whoever did it and when, whose comment is kept in the values but not named in changed, since who wrote it is unknown.';

------------------------------------------------------------------------------
-- 2. Writing a change

-- 20261116000200_list_history.sql's, the same, with the row marked fixed when
-- the item's list is finished: only a fix changes an item of one, and its
-- writers (private.write_list_item and write_list_item_photo, below) hold
-- the list's lock.
create or replace function private.record_item_change(
  item_before public.list_items,
  item_after public.list_items,
  actor uuid,
  at_time timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  fields text[];
begin
  fields := array_remove(array[
    case when item_after.checked is distinct from item_before.checked then 'checked' end,
    case when item_after.given is distinct from item_before.given then 'given' end,
    case when item_after.reading is distinct from item_before.reading then 'reading' end,
    case when item_after.answer is distinct from item_before.answer then 'answer' end,
    case when item_after.comment is distinct from item_before.comment then 'comment' end,
    case when item_after.photo_path is distinct from item_before.photo_path then 'photo' end
  ]::text[], null);
  if cardinality(fields) = 0 then
    return;
  end if;

  insert into public.list_item_changes (
    item_id, list_id, business_id, changed_by, changed_at, changed,
    checked, given, reading, answer, comment, photo, done, fixed
  )
  values (
    item_after.id, item_after.list_id, item_after.business_id, actor, at_time, fields,
    item_after.checked, item_after.given, item_after.reading, item_after.answer,
    item_after.comment, item_after.photo_path is not null, item_after.done,
    exists (
      select 1 from public.lists x
      where x.id = item_after.list_id and x.status = 'finished'
    )
  );
end;
$$;

------------------------------------------------------------------------------
-- 3. Who may fix a finished list

-- Whether `actor` may fix list `l` at `at_time`: a finished list, by someone
-- who runs the lists (lists.manage, by private.holds_perm), at any time.
-- L6b-2 widens it to those given lists.fix, for a list they hold, within the
-- business's window; `at_time` is for that. Its callers check membership and
-- the module first.
create function private.can_fix_list(l public.lists, actor uuid, at_time timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select l.status = 'finished' and private.can_manage_lists(l.business_id, actor)
$$;

------------------------------------------------------------------------------
-- 4. Filling or fixing an item

-- public.set_list_item of 20261116000200_list_history.sql, moved here with a
-- flag. Not fixing, it is as it was: whoever holds the list or runs the lists
-- (42501 otherwise), on an open list (55000 otherwise). Fixing: whoever holds
-- the list or runs the lists, as filling, so nobody else learns how it stands
-- (42501 otherwise), a finished list (55000 otherwise), by those
-- private.can_fix_list allows (42501 otherwise); a required item left not
-- done is refused (23514, hint 'required'); who did the item and when stay
-- while it stays done; the item and the list are marked (fixed_at) and the
-- change logged as lists.fix with from and to. A change that puts a reading
-- out of its range writes lists.out_of_range either way. A save that changes
-- nothing writes nothing.
create function private.write_list_item(
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

-- 20261116000200_list_history.sql's, the same signature, its body moved to
-- private.write_list_item: an open list, as before.
create or replace function public.set_list_item(
  actor uuid,
  item uuid,
  result jsonb,
  at_time timestamptz default now()
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.write_list_item(actor, item, result, at_time, false)
$$;

-- Fixes an item of a finished list in place (private.write_list_item): the
-- list stays finished, the change is the fixer's and marked fixed.
create function public.fix_list_item(
  actor uuid,
  item uuid,
  result jsonb,
  at_time timestamptz default now()
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.write_list_item(actor, item, result, at_time, true)
$$;

------------------------------------------------------------------------------
-- 5. A photo item's file

-- public.set_list_item_photo of 20261116000200_list_history.sql, moved here
-- with a flag. Not fixing, it is as it was. Fixing: whoever holds the list or
-- runs the lists (42501 otherwise), a finished list (55000 otherwise), by
-- those private.can_fix_list allows (42501 otherwise); a required photo is
-- replaced, never removed (23514, hint 'required'); who took it and when
-- stay while it has one; the item and the list are marked (fixed_at) and the
-- change logged as lists.fix. The photo the item already has still returns
-- at once and writes nothing.
create function private.write_list_item_photo(
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

-- 20261116000200_list_history.sql's, the same signature, its body moved to
-- private.write_list_item_photo: an open list, as before.
create or replace function public.set_list_item_photo(
  actor uuid,
  item uuid,
  new_path text default null,
  at_time timestamptz default now()
)
returns text
language sql
security definer
set search_path = ''
as $$
  select private.write_list_item_photo(actor, item, new_path, at_time, false)
$$;

-- Sets, replaces or removes the photo of an item of a finished list in place
-- (private.write_list_item_photo); returns the file it replaced, for the
-- server to delete, as set_list_item_photo does.
create function public.fix_list_item_photo(
  actor uuid,
  item uuid,
  new_path text default null,
  at_time timestamptz default now()
)
returns text
language sql
security definer
set search_path = ''
as $$
  select private.write_list_item_photo(actor, item, new_path, at_time, true)
$$;

------------------------------------------------------------------------------
-- Who may call what

-- These run inside the functions here, as their owner, for nobody else.
revoke execute on function private.record_item_change(
  public.list_items, public.list_items, uuid, timestamptz
) from public, anon, authenticated;
revoke execute on function private.can_fix_list(public.lists, uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke execute on function private.write_list_item(uuid, uuid, jsonb, timestamptz, boolean)
  from public, anon, authenticated, service_role;
revoke execute on function private.write_list_item_photo(uuid, uuid, text, timestamptz, boolean)
  from public, anon, authenticated, service_role;

-- Replaced above; their grants stay as before: the server's alone.
revoke execute on function public.set_list_item(uuid, uuid, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.set_list_item(uuid, uuid, jsonb, timestamptz)
  to service_role;
revoke execute on function public.set_list_item_photo(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.set_list_item_photo(uuid, uuid, text, timestamptz)
  to service_role;

-- New: the server's alone too.
revoke execute on function public.fix_list_item(uuid, uuid, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.fix_list_item(uuid, uuid, jsonb, timestamptz)
  to service_role;
revoke execute on function public.fix_list_item_photo(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.fix_list_item_photo(uuid, uuid, text, timestamptz)
  to service_role;
