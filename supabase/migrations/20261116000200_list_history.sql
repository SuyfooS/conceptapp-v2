-- Lists: each item keeps its whole story (L6a of the L6 plan; Orel chose it
-- first on 16 November 2026). Until now an item kept only its last result
-- and who gave it (list_items.done_by, done_at): a second reading took the
-- first one's place and name, an untick left nothing, a comment handed the
-- tick to whoever wrote it, and a reopen nulled the close it undid. Now every
-- real change is a row, and so is every reopen.
--
--   changes     public.list_item_changes: one row per real change of an item,
--               written by public.set_list_item and set_list_item_photo
--               through private.record_item_change, with who and when
--               (changed_by, changed_at), which of checked, given, reading,
--               answer, comment and photo changed, and the item after it:
--               its values, whether it has a photo, whether it is done. The
--               earlier text of answers and comments stays (Orel's default
--               on Q3, as for ticks, counts and readings); earlier photos
--               don't: a replaced file is deleted at once (@db/list-photos),
--               so the row keeps only that there was one. Ordered by
--               (changed_at, id): the demo seed fills several items in one
--               transaction, at the same now().
--   reopens     public.list_reopens: the close a reopen undoes, which
--               public.reopen_list nulls on the list: what it was (finished
--               or cancelled), by whom and when, and who opened it again and
--               when. The same shape as list_passes, so a list's timeline
--               shows earlier closes and reopens in time order.
--   reading     both follow their list, as its items, people and passes do:
--               whoever reads the list reads its items' history (Orel's
--               default), which is the audience of today's "done by" line:
--               those it is for, its sender, the department that asked, the
--               departments a pass went through, a view as the role it views,
--               and those who run the lists. The history tells nobody of
--               its own: the item is the record, so it adds no log row and
--               no line. A reading that a change puts out of its range still
--               writes lists.out_of_range and tells those who run the lists,
--               as before (a second person's 6°C after a 4°C too).
--   kept        append-only: no write for the browser roles, none for the
--               service role (the default privileges grant them), and a
--               guard before update (private.refuse_history_change) that lets
--               through only a person going to null with nothing else, the
--               profiles' `on delete set null`, as private.refuse_log_update
--               does for the log. No delete trigger: rows go only with their
--               list (its deletion, a demo reset, a business deleted), by
--               cascade, which runs as the table's owner. A key on list_items
--               (id, list_id, business_id) makes sure a row never names
--               another list's or another business's item.
--   saving      public.set_list_item writes nothing when nothing changes: a
--               save whose checked, reading, answer, given and comment are
--               those the item has returns the progress with no update and
--               no row. done_by and done_at move only when the item's value
--               changes (checked, given, reading, answer), so a comment alone
--               no longer hands the tick to whoever wrote it, and saving the
--               same value again no longer takes it over; clearing the item
--               nulls them, and a photo item keeps them, as before. Every
--               check and the order of the locks are as they were.
--   photos      public.set_list_item_photo writes a row for each photo set,
--               replaced or removed; the photo it already has writes nothing,
--               as before, and the daily clean-up (public.forget_list_photos)
--               writes none: the item still has its photo's path.
--   backfill    every item already done gets one row, by whoever did it and
--               when (done_by, done_at), naming the fields its result has, so
--               the first tick isn't lost at the next change. Its comment is
--               kept in the values but not named, since who wrote it is
--               unknown. Reopens from before have no row (only
--               lists.reopened_at says one happened).
--
-- Replaced, with their grants as before: public.set_list_item and
-- public.reopen_list (20261110001300_list_schedules.sql), and
-- public.set_list_item_photo (20261110001500_list_photos.sql). Their callers
-- are unchanged: the app (@db/lists, @db/list-photos), private.seed_demo_lists
-- (20261115001200_roles_lists.sql), whose example lists get their history,
-- and the pgTAP files. Unchanged too: finish_list, cancel_list, pass_list,
-- send_list, the tick (an item created is not a change), notify_for_lists
-- and the log.

------------------------------------------------------------------------------
-- 1. A key for an item of a list of a business

alter table public.list_items
  add constraint list_items_id_list_business_key unique (id, list_id, business_id);

------------------------------------------------------------------------------
-- 2. What happened to each item

-- One row per real change of an item, oldest first by (changed_at, id), with
-- the item as it was after it.
create table public.list_item_changes (
  id bigint generated always as identity primary key,
  item_id uuid not null,
  list_id uuid not null,
  business_id uuid not null,
  -- Who changed it may be gone (their profile deleted); when, never.
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null,
  -- Which fields changed.
  changed text[] not null
    check (
      cardinality(changed) >= 1
      and changed <@ '{checked,given,reading,answer,comment,photo}'::text[]
    ),
  -- The item after the change, held to list_items' own rules.
  checked boolean,
  given integer check (given between 0 and 9999),
  reading numeric check (reading between -100000 and 100000),
  answer text check (char_length(answer) between 1 and 500 and answer = btrim(answer)),
  comment text check (char_length(comment) between 1 and 200 and comment = btrim(comment)),
  -- Whether it has a photo; never the file, which a replacement deletes.
  photo boolean not null,
  done boolean not null,
  foreign key (item_id, list_id, business_id)
    references public.list_items (id, list_id, business_id) on delete cascade
);

create index list_item_changes_list_idx
  on public.list_item_changes (list_id, business_id, changed_at, id);
create index list_item_changes_item_idx
  on public.list_item_changes (item_id, list_id, business_id);
create index list_item_changes_changed_by_idx on public.list_item_changes (changed_by);

------------------------------------------------------------------------------
-- 3. The closes a reopen undid

create table public.list_reopens (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null,
  business_id uuid not null,
  reopened_by uuid references public.profiles (id) on delete set null,
  reopened_at timestamptz not null,
  -- The close it undid: what it was, by whom and when.
  was text not null check (was in ('finished', 'cancelled')),
  was_by uuid references public.profiles (id) on delete set null,
  was_at timestamptz not null,
  foreign key (list_id, business_id)
    references public.lists (id, business_id) on delete cascade
);

create index list_reopens_list_idx on public.list_reopens (list_id, business_id, reopened_at);
create index list_reopens_reopened_by_idx on public.list_reopens (reopened_by);
create index list_reopens_was_by_idx on public.list_reopens (was_by);

------------------------------------------------------------------------------
-- 4. Who reads them, and nobody changes them

alter table public.list_item_changes enable row level security;
alter table public.list_reopens enable row level security;

-- Written only by the functions below, as their owner.
revoke all on public.list_item_changes, public.list_reopens from anon, authenticated;
grant select on public.list_item_changes, public.list_reopens to authenticated;
-- The service role reads; it never writes, and a truncate skips the triggers.
revoke insert, update, delete, truncate on public.list_item_changes, public.list_reopens
  from service_role;

-- As the list's items, people and passes (20261109000600_lists.sql): whoever
-- reads the list (its policy, 20261115001200_roles_lists.sql: those who run
-- the lists, members and views alike, and private.sees_list).
create policy "changes follow their list"
  on public.list_item_changes for select to authenticated
  using (exists (select 1 from public.lists l where l.id = list_item_changes.list_id));

create policy "reopens follow their list"
  on public.list_reopens for select to authenticated
  using (exists (select 1 from public.lists l where l.id = list_reopens.list_id));

-- History never changes, but for one thing: its people are `on delete set
-- null`, and that is an UPDATE this trigger sees. Refusing it would make
-- deleting any account that ever filled or reopened a list fail. So the one
-- change allowed is the trigger's named person columns (its arguments) going
-- to null, at least one of them, with nothing else changed, as
-- private.refuse_log_update (20261110000100_hours_kept.sql) allows the log's
-- actor. Rows are deleted only by cascade, with their list.
create function private.refuse_history_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_row jsonb;
  after_row jsonb;
  person text;
  emptied boolean := false;
begin
  before_row := to_jsonb(old);
  after_row := to_jsonb(new);
  foreach person in array tg_argv loop
    if after_row ->> person is null then
      emptied := emptied or before_row ->> person is not null;
    elsif after_row -> person is distinct from before_row -> person then
      raise exception 'The history is append-only' using errcode = '42501';
    end if;
  end loop;
  if emptied and (after_row - tg_argv) = (before_row - tg_argv) then
    return new;
  end if;
  raise exception 'The history is append-only' using errcode = '42501';
end;
$$;

create trigger list_item_changes_kept before update on public.list_item_changes
  for each row execute function private.refuse_history_change('changed_by');
create trigger list_reopens_kept before update on public.list_reopens
  for each row execute function private.refuse_history_change('reopened_by', 'was_by');

comment on table public.list_item_changes is
  'What happened to each list item: one row per real change, by whom and when, naming which of checked, given, reading, answer, comment and photo changed, with the item after it (earlier answers and comments stay; earlier photos are not kept, only that there was one). Written only by public.set_list_item and set_list_item_photo; read by whoever reads the list; never changed but for its person going when their account does; deleted only with its list. Items done before 16 November 2026 have one backfilled row, by whoever did it and when, whose comment is kept in the values but not named in changed, since who wrote it is unknown.';
comment on table public.list_reopens is
  'The close each reopen of a list undid (finished or cancelled, by whom and when), and who opened it again and when. Written only by public.reopen_list; read by whoever reads the list; never changed but for its people going when their accounts do; deleted only with its list. Reopens before 16 November 2026 have no row.';

------------------------------------------------------------------------------
-- 5. Writing a change

-- Records `item_after`, the item as `actor` left it at `at_time`, against
-- `item_before`: a row naming the fields whose values differ (the photo by
-- its path), or nothing when none does. Its callers hold the item's lock:
-- public.set_list_item and set_list_item_photo, below.
create function private.record_item_change(
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
    checked, given, reading, answer, comment, photo, done
  )
  values (
    item_after.id, item_after.list_id, item_after.business_id, actor, at_time, fields,
    item_after.checked, item_after.given, item_after.reading, item_after.answer,
    item_after.comment, item_after.photo_path is not null, item_after.done
  );
end;
$$;

------------------------------------------------------------------------------
-- 6. Filling an item

-- set_list_item of 20261110001300_list_schedules.sql, which now keeps the
-- item's history: a save that changes nothing (checked, reading, answer,
-- given and comment as the item has them) returns the progress with no update
-- and no row; done_by and done_at move only when its value changes (checked,
-- given, reading, answer), so a comment alone keeps who did it and when;
-- clearing the item nulls them, and a photo item keeps them, as before. The
-- change is recorded (private.record_item_change). Every check, the order of
-- the locks and the `lists.out_of_range` row are as they were.
create or replace function public.set_list_item(
  actor uuid,
  item uuid,
  result jsonb,
  at_time timestamptz default now()
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
  if not (private.holds_list(l.id, actor) or private.can_manage_lists(l.business_id, actor)) then
    raise exception 'The list is not yours to fill' using errcode = '42501';
  end if;
  if l.status <> 'open' then
    raise exception 'The list is closed' using errcode = '55000';
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
      done_by = case
        when it.kind = 'photo' or not value_changed then it.done_by
        when is_done then actor
      end,
      done_at = case
        when it.kind = 'photo' or not value_changed then it.done_at
        when is_done then at_time
      end
    where i.id = item
    returning i.* into saved;

    perform private.record_item_change(it, saved, actor, at_time);
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
-- 7. A photo item's file

-- set_list_item_photo of 20261110001500_list_photos.sql, which now records
-- each photo set, replaced or removed (private.record_item_change). The photo
-- the item already has still returns at once and writes nothing.
create or replace function public.set_list_item_photo(
  actor uuid,
  item uuid,
  new_path text default null,
  at_time timestamptz default now()
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
  if not (private.holds_list(l.id, actor) or private.can_manage_lists(l.business_id, actor)) then
    raise exception 'The list is not yours to fill' using errcode = '42501';
  end if;
  if l.status <> 'open' then
    raise exception 'The list is closed' using errcode = '55000';
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
  replaced := case when it.photo_removed_at is null then it.photo_path end;

  update public.list_items i
  set photo_path = new_path,
    photo_removed_at = null,
    done = new_path is not null,
    done_by = case when new_path is not null then actor end,
    done_at = case when new_path is not null then at_time end
  where i.id = item
  returning i.* into saved;

  perform private.record_item_change(it, saved, actor, at_time);

  return replaced;
end;
$$;

------------------------------------------------------------------------------
-- 8. Opening a list again

-- reopen_list of 20261110001300_list_schedules.sql, which now keeps the close
-- it undoes (public.list_reopens: what it was, by whom and when) before the
-- list forgets it. Who may reopen, the open-lists cap and what it tells are
-- as they were.
create or replace function public.reopen_list(
  actor uuid,
  list uuid,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lists%rowtype;
begin
  select x.* into l from public.lists x where x.id = list for update;
  if not found or not exists (
    select 1 from public.memberships m
    where m.business_id = l.business_id and m.user_id = actor and m.active
  ) then
    raise exception 'Unknown list' using errcode = 'P0002';
  end if;
  perform private.lists_on(l.business_id);
  if l.status not in ('finished', 'cancelled') then
    raise exception 'Only a finished or cancelled list opens again' using errcode = '55000';
  end if;
  if not (
    private.can_manage_lists(l.business_id, actor)
    or (
      l.status = 'finished'
      and l.finished_by = actor
      and at_time <= l.finished_at + interval '5 minutes'
    )
    or (
      l.status = 'cancelled'
      and l.closed_by = actor
      and at_time <= l.closed_at + interval '5 minutes'
    )
  ) then
    raise exception 'Only a list manager opens it again after 5 minutes'
      using errcode = '42501';
  end if;
  -- The open-lists cap holds here too, under the business's lock as in send_list.
  perform 1 from public.businesses b where b.id = l.business_id for no key update;
  if (
    select count(*) from public.lists x
    where x.business_id = l.business_id and x.status = 'open'
  ) >= 500 then
    raise exception 'A business keeps at most 500 open lists' using errcode = '22023';
  end if;

  -- The close this undoes, before the list forgets it.
  insert into public.list_reopens (
    list_id, business_id, reopened_by, reopened_at, was, was_by, was_at
  )
  values (
    l.id, l.business_id, actor, at_time, l.status,
    case when l.status = 'finished' then l.finished_by else l.closed_by end,
    case when l.status = 'finished' then l.finished_at else l.closed_at end
  );

  update public.lists x
  set status = 'open',
    finished_at = null,
    finished_by = null,
    closed_at = null,
    closed_by = null,
    reopened_at = at_time
  where x.id = l.id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    l.business_id, actor, 'lists.reopen',
    jsonb_build_object('list', l.id, 'name', l.name, 'was', l.status)
  );
end;
$$;

------------------------------------------------------------------------------
-- 9. The items already done

-- One row for each item already done that has none: by whoever did it and
-- when (done_by, done_at), with its values, naming the fields its result has
-- (checked, given, reading, answer, photo). Its comment is kept but not
-- named: who wrote it is unknown. Run once below; safe to run again. Returns
-- how many it added.
create function private.backfill_list_item_changes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  added integer;
begin
  insert into public.list_item_changes (
    item_id, list_id, business_id, changed_by, changed_at, changed,
    checked, given, reading, answer, comment, photo, done
  )
  select i.id, i.list_id, i.business_id, i.done_by, i.done_at,
    array_remove(array[
      case when i.checked is not null then 'checked' end,
      case when i.given is not null then 'given' end,
      case when i.reading is not null then 'reading' end,
      case when i.answer is not null then 'answer' end,
      case when i.photo_path is not null then 'photo' end
    ]::text[], null),
    i.checked, i.given, i.reading, i.answer, i.comment, i.photo_path is not null, i.done
  from public.list_items i
  where i.done
    and not exists (
      select 1 from public.list_item_changes c
      where c.item_id = i.id and c.list_id = i.list_id and c.business_id = i.business_id
    );
  get diagnostics added = row_count;
  return added;
end;
$$;

select private.backfill_list_item_changes();

------------------------------------------------------------------------------
-- Who may call what

-- These run inside the functions and triggers here, as their owner.
revoke execute on function private.refuse_history_change() from public, anon, authenticated;
revoke execute on function private.record_item_change(
  public.list_items, public.list_items, uuid, timestamptz
) from public, anon, authenticated;
revoke execute on function private.backfill_list_item_changes()
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
revoke execute on function public.reopen_list(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.reopen_list(uuid, uuid, timestamptz) to service_role;
