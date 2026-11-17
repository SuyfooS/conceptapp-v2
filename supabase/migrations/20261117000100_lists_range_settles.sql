-- Lists: a reading back inside its range settles the line about it (Orel,
-- 17 November 2026, the third question left from L6). Until now a reading
-- outside its range told those who run the lists (lists.out_of_range, the
-- line 'list.range:<item>') and the line stayed open after someone read the
-- item again inside its range, or fixed it there once the list closed: Home
-- and the inbox kept asking about a fridge that was fine.
--
--   settles     private.write_list_item, which set_list_item and
--               fix_list_item run, settles the item's line when a reading
--               it saves is new and inside the item's range
--               (private.resolve_notifications): read, settled, and its
--               push skipped if still queued, for everyone it reached.
--               Filling an open list and fixing a closed one alike.
--   stays       a reading emptied leaves the line: taking a number away
--               says nothing about the fridge. An item with no range has no
--               line, so nothing is looked for.
--   again       a reading outside again writes lists.out_of_range as before
--               (it was inside), and private.notify realerts the settled
--               line: unread, open, and on the phone again.
--   nothing     no new log row, key or word: the item's history already
--   more        says who read it again (list_item_changes), and a fix's
--               lists.fix row what it was and what it is.
--
-- The rest of the body is 20261116000400_lists_fix_switch.sql's, unchanged.

------------------------------------------------------------------------------
-- Filling or fixing an item

-- 20261116000400_lists_fix_switch.sql's, the same, with the line settled
-- when a reading comes back inside its range.
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

  -- Back inside its range: the line about it is settled for everyone it
  -- reached, read, and off the phone if not sent yet (Orel, 17 November
  -- 2026). Filling or fixing alike. A reading emptied leaves the line, and
  -- one outside again opens it again (private.notify realerts).
  if it.kind = 'number'
    and (it.min_value is not null or it.max_value is not null)
    and new_reading is not null
    and new_reading is distinct from it.reading
    and (it.min_value is null or new_reading >= it.min_value)
    and (it.max_value is null or new_reading <= it.max_value) then
    perform private.resolve_notifications(l.business_id, 'list.range:' || it.id, at_time);
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
-- Who may call what

-- Replaced in place, the same signature: its grants stay as its first
-- migration set them; revoked again all the same.
revoke execute on function private.write_list_item(uuid, uuid, jsonb, timestamptz, boolean)
  from public, anon, authenticated, service_role;
