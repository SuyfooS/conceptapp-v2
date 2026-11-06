-- What a manager's corrections must not do, found building their screen:
--
--   Leave a shift that ended without an end. It would reopen it, and the person
--   would be on the clock again with hours running. A stale screen could do this
--   to a real clock-out. Only an entry that is still open may stay open.
--
--   Lose its breaks when it moves. Changing only a shift's date moved it away
--   from its breaks, so the trigger took them for outside the entry and deleted
--   them, and unpaid time became paid. An entry that moves whole now takes its
--   breaks along.

-- Breaks move together in one statement, and may pass over each other's old
-- times on the way, so overlap is checked at the end of it.
alter table public.time_breaks drop constraint time_breaks_no_overlap;
alter table public.time_breaks
  add constraint time_breaks_no_overlap exclude using gist (
    entry_id with =,
    tstzrange(started_at, coalesce(ended_at, 'infinity'::timestamptz)) with &&
  ) deferrable initially immediate;

create or replace function private.fit_breaks_to_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The whole entry moved by the same amount: its breaks go with it.
  if new.clock_in <> old.clock_in
    and new.clock_out is not null
    and old.clock_out is not null
    and new.clock_in - old.clock_in = new.clock_out - old.clock_out
  then
    set constraints public.time_breaks_no_overlap deferred;
    update public.time_breaks b
    set started_at = b.started_at + (new.clock_in - old.clock_in),
      ended_at = b.ended_at + (new.clock_in - old.clock_in)
    where b.entry_id = new.id;
    set constraints public.time_breaks_no_overlap immediate;
    return null;
  end if;

  delete from public.time_breaks b
  where b.entry_id = new.id
    and (
      b.started_at >= coalesce(new.clock_out, 'infinity'::timestamptz)
      or b.ended_at <= new.clock_in
    );

  update public.time_breaks b
  set started_at = greatest(b.started_at, new.clock_in),
    ended_at = case
      when new.clock_out is null then b.ended_at
      else least(coalesce(b.ended_at, new.clock_out), new.clock_out)
    end
  where b.entry_id = new.id
    and (
      b.started_at < new.clock_in
      or (new.clock_out is not null and (b.ended_at is null or b.ended_at > new.clock_out))
    );

  return null;
end;
$$;

create or replace function public.correct_time_entry(
  actor uuid,
  entry uuid,
  new_clock_in timestamptz,
  new_clock_out timestamptz default null,
  note text default null,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.time_entries%rowtype;
begin
  select * into e from public.time_entries where id = entry for update;
  if not found then
    raise exception 'Unknown entry' using errcode = 'P0002';
  end if;

  perform private.check_time_clock_on(e.business_id);

  if not private.can_edit_clock(e.business_id, actor) then
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;

  if new_clock_out is null and e.clock_out is not null then
    raise exception 'An entry that ended needs an end' using errcode = '22023';
  end if;

  perform private.check_entry_times(new_clock_in, new_clock_out, at_time);

  if new_clock_out is null and at_time - new_clock_in > interval '24 hours' then
    raise exception 'An entry is at most 24 hours' using errcode = '22023';
  end if;

  update public.time_entries
  set clock_in = new_clock_in,
    clock_out = new_clock_out,
    note = coalesce(nullif(btrim(correct_time_entry.note), ''), time_entries.note),
    edited_by = actor,
    edited_at = at_time
  where id = entry;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    e.business_id, actor, 'clock.correct',
    jsonb_build_object('entry', entry, 'person', e.user_id,
      'from', jsonb_build_object('clock_in', e.clock_in, 'clock_out', e.clock_out),
      'to', jsonb_build_object('clock_in', new_clock_in, 'clock_out', new_clock_out))
  );
end;
$$;
