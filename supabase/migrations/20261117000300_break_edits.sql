-- Time clock: a shift's breaks are fixed one at a time (the clock plan's PR2;
-- ROADMAP: "ביטול משמרת ועריכת הפסקה ב-/clock/team/[person]"). Someone who
-- edits the clock changes a break's times, adds one that was forgotten or
-- removes one pressed by mistake, each with why, and a removal can be taken
-- back for ten minutes. Nothing deletes a break for it (hours are kept,
-- 20261110000100_hours_kept.sql): a removed break is marked, its times kept
-- as the record of what was removed. Nothing in the app calls these yet: the
-- reads (PR3) leave removed breaks out first, then the person's page (PR5)
-- edits them.
--
--   columns     time_breaks gains removed_at and removed_by (`on delete set
--               null`, its time kept, as confirmed_by). A removed break has
--               always ended (a check), so whatever looks for an open break
--               (`ended_at is null`: start_break, end_break, a clock-out's
--               fit) never meets one.
--   overlap     time_breaks_no_overlap, the same name and still deferrable
--               (private.fit_breaks_to_entry defers it by name), holds for
--               live breaks only: the right break goes over a removed one.
--   the check   private.check_break_fits: both times, the end after the
--               start, nothing in the future, and inside its shift, from its
--               start to its end, or to now while it is open (22023, hint
--               'break_outside'). An overlap is the constraint's (23P01).
--   editing     public.add_time_break(actor, entry, new_start, new_end, note,
--               at_time), returning the new break's id, change_time_break(
--               actor, time_break, new_start, new_end, note, at_time) and
--               remove_time_break(actor, time_break, note, at_time), with the
--               secret key, for `actor`: someone who edits the clock
--               (private.can_edit_clock, 42501), never on their own shift but
--               an owner (42501, "your own hours", as a cancel), never on a
--               cancelled shift (55000: it is brought back first), and always
--               with a reason (22023). A break still running is neither
--               changed nor removed (55000, hint 'break_open'): it ends when
--               the person comes back or leaves, or with a correction of the
--               shift. Nor is a removed one (55000). A new break is paid or
--               not by the business's setting now, as start_break's; a changed
--               one keeps what it was.
--   undo        public.restore_time_break(actor, time_break, at_time): only
--               by whoever removed it, within ten minutes (55000 "Too late to
--               bring it back", hint 'too_late'; after that, it is added
--               again), with no reason. It comes back as it was, and only
--               while it still fits its shift (22023) beside the live breaks
--               (23P01).
--   the shift   each is a correction of its shift: the shift's edited_by,
--               edited_at and note (the restore's, edited_at only), so it reads
--               as corrected, a payroll file made before it sees a change, and
--               its clock-out can no longer be taken back.
--   the log     one clock.break_edit each {entry, person, clock_in, break,
--               change (add, change, remove or restore), from and to (each
--               {start, end}, or null), unpaid, note (but a restore's)}, with
--               closed_month when the break is unpaid and the shift's day by
--               the business's clock is in a closed month: only an unpaid
--               break changes the paid hours. That one tells the month's
--               closer and the accountants (pay.after_close,
--               private.notify_for_payroll, whose trigger takes the action).
--   live only   private.fit_breaks_to_entry moves, cuts and deletes live
--               breaks only; undo_clock_out and restore_time_entry reopen live
--               ones only; cancel_time_entry's refusal of breaks after the
--               shift's first day asks about live ones only. A removed break
--               keeps its times and never comes back open.
--
-- Locks: each takes the shift first (`for update`), as start_break,
-- clock_out, correct_time_entry, cancel_time_entry and undo_clock_out do,
-- then the break. end_break takes only the break and waits for no shift, so
-- the order can't deadlock, and whatever changed the shift or its break a
-- moment before is seen.

------------------------------------------------------------------------------
-- 1. The columns

alter table public.time_breaks
  add column removed_at timestamptz,
  add column removed_by uuid references public.profiles (id) on delete set null,
  -- A remover always has a time; the time stays if the remover is deleted.
  add constraint time_breaks_removed_by check (removed_by is null or removed_at is not null),
  add constraint time_breaks_removed_ended check (removed_at is null or ended_at is not null);

create index time_breaks_removed_by_idx on public.time_breaks (removed_by);

-- Live breaks of one shift never share a moment; a removed one makes way.
-- Still checked at the end of a statement when deferred, as a shift that
-- moves whole moves its breaks.
alter table public.time_breaks
  drop constraint time_breaks_no_overlap,
  add constraint time_breaks_no_overlap exclude using gist (
    entry_id with =,
    tstzrange(started_at, coalesce(ended_at, 'infinity'::timestamptz)) with &&
  ) where (removed_at is null) deferrable initially immediate;

comment on column public.time_breaks.removed_at is
  'When the break was removed (public.remove_time_break): it stays, with its times, and counts nowhere. Null for a live break. A removed break has always ended.';
comment on column public.time_breaks.removed_by is
  'Who removed it; null once their profile goes, while removed_at stays.';

------------------------------------------------------------------------------
-- 2. What a break's times must be

-- Raise unless the times make a break of the shift `e` at `at_time`: both
-- given, the end after the start, nothing in the future, and inside the
-- shift, from its start to its end, or to now while it is open.
create function private.check_break_fits(
  e public.time_entries,
  new_start timestamptz,
  new_end timestamptz,
  at_time timestamptz
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if new_start is null or new_end is null then
    raise exception 'A break needs its start and end' using errcode = '22023';
  end if;
  if new_end <= new_start then
    raise exception 'A break must end after it starts' using errcode = '22023';
  end if;
  if new_end > at_time then
    raise exception 'A break cannot be in the future' using errcode = '22023';
  end if;
  if new_start < e.clock_in or new_end > coalesce(e.clock_out, at_time) then
    raise exception 'A break must be inside its shift'
      using errcode = '22023', hint = 'break_outside';
  end if;
end;
$$;

-- What every break edit does besides the break: its shift reads as
-- corrected (edited_by, edited_at and the reason as its note; a restore,
-- which asks for none, stamps edited_at only), and one clock.break_edit row.
-- That row names the closed month when the break is unpaid and the shift's
-- day by the business's clock, as correct_time_entry names it, is in one:
-- only an unpaid break changes the paid hours.
create function private.record_break_edit(
  actor uuid,
  e public.time_entries,
  break_id uuid,
  change_kind text,
  before_times jsonb,
  after_times jsonb,
  break_unpaid boolean,
  reason text,
  at_time timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text;
  closed_text text;
begin
  if reason is null then
    update public.time_entries set edited_at = at_time where id = e.id;
  else
    update public.time_entries
    set note = reason, edited_by = actor, edited_at = at_time
    where id = e.id;
  end if;

  if break_unpaid then
    select bz.timezone into tz from public.businesses bz where bz.id = e.business_id;
    if private.month_closed(e.business_id, (e.clock_in at time zone tz)::date) then
      closed_text := to_char((e.clock_in at time zone tz)::date, 'YYYY-MM');
    end if;
  end if;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    e.business_id, actor, 'clock.break_edit',
    jsonb_build_object('entry', e.id, 'person', e.user_id, 'clock_in', e.clock_in,
      'break', break_id, 'change', change_kind, 'from', before_times, 'to', after_times,
      'unpaid', break_unpaid)
    || case
      when reason is null then '{}'::jsonb
      else jsonb_build_object('note', reason)
    end
    || case
      when closed_text is null then '{}'::jsonb
      else jsonb_build_object('closed_month', closed_text)
    end
  );
end;
$$;

------------------------------------------------------------------------------
-- 3. Adding, changing, removing and bringing back a break

-- Someone who edits the clock adds a break the shift is missing, with why.
-- It is paid or not by the business's setting now, as start_break's.
-- Returns its id.
create function public.add_time_break(
  actor uuid,
  entry uuid,
  new_start timestamptz,
  new_end timestamptz,
  note text,
  at_time timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.time_entries%rowtype;
  reason text := nullif(btrim(add_time_break.note), '');
  break_unpaid boolean;
  break_id uuid;
begin
  select * into e from public.time_entries t where t.id = entry for update;
  if not found then
    raise exception 'Unknown entry' using errcode = 'P0002';
  end if;

  perform private.check_time_clock_on(e.business_id);

  if not private.can_edit_clock(e.business_id, actor) then
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;

  if e.user_id = actor and not private.is_active_owner(e.business_id, actor) then
    raise exception 'Only an owner cancels or changes your own hours' using errcode = '42501';
  end if;

  if e.cancelled_at is not null then
    raise exception 'The shift is cancelled' using errcode = '55000';
  end if;

  if reason is null then
    raise exception 'A break edit needs its reason' using errcode = '22023';
  end if;

  perform private.check_break_fits(e, new_start, new_end, at_time);

  -- As start_break reads it.
  break_unpaid := coalesce((
    select (bm.settings ->> 'unpaidBreaks')::boolean
    from public.business_modules bm
    where bm.business_id = e.business_id and bm.module_key = 'time_clock'
  ), false);

  -- Over a live break of the shift, a running one included, the constraint
  -- refuses it (23P01).
  insert into public.time_breaks (entry_id, business_id, user_id, started_at, ended_at, unpaid)
  values (entry, e.business_id, e.user_id, new_start, new_end, break_unpaid)
  returning id into break_id;

  perform private.record_break_edit(
    actor, e, break_id, 'add', null::jsonb,
    jsonb_build_object('start', new_start, 'end', new_end),
    break_unpaid, reason, at_time
  );

  return break_id;
end;
$$;

-- Someone who edits the clock changes the times of a break that ended, with
-- why. It stays paid or not as it was.
create function public.change_time_break(
  actor uuid,
  time_break uuid,
  new_start timestamptz,
  new_end timestamptz,
  note text,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  shift uuid;
  e public.time_entries%rowtype;
  b public.time_breaks%rowtype;
  reason text := nullif(btrim(change_time_break.note), '');
begin
  -- Its shift first, then the break (a break never moves to another shift).
  -- A correction may have cut the break away meanwhile.
  select tb.entry_id into shift from public.time_breaks tb where tb.id = time_break;
  if not found then
    raise exception 'Unknown break' using errcode = 'P0002';
  end if;
  select * into e from public.time_entries t where t.id = shift for update;
  select * into b from public.time_breaks tb where tb.id = time_break for update;
  if not found then
    raise exception 'Unknown break' using errcode = 'P0002';
  end if;

  perform private.check_time_clock_on(e.business_id);

  if not private.can_edit_clock(e.business_id, actor) then
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;

  if e.user_id = actor and not private.is_active_owner(e.business_id, actor) then
    raise exception 'Only an owner cancels or changes your own hours' using errcode = '42501';
  end if;

  if e.cancelled_at is not null then
    raise exception 'The shift is cancelled' using errcode = '55000';
  end if;

  if b.removed_at is not null then
    raise exception 'The break is removed' using errcode = '55000';
  end if;

  if b.ended_at is null then
    raise exception 'The break has not ended' using errcode = '55000', hint = 'break_open';
  end if;

  if reason is null then
    raise exception 'A break edit needs its reason' using errcode = '22023';
  end if;

  perform private.check_break_fits(e, new_start, new_end, at_time);

  -- Over another live break, the constraint refuses it (23P01).
  update public.time_breaks
  set started_at = new_start, ended_at = new_end
  where id = time_break;

  perform private.record_break_edit(
    actor, e, time_break, 'change',
    jsonb_build_object('start', b.started_at, 'end', b.ended_at),
    jsonb_build_object('start', new_start, 'end', new_end),
    b.unpaid, reason, at_time
  );
end;
$$;

-- Someone who edits the clock removes a break that ended, with why: it is
-- marked removed, with who and when, and keeps its times.
create function public.remove_time_break(
  actor uuid,
  time_break uuid,
  note text,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  shift uuid;
  e public.time_entries%rowtype;
  b public.time_breaks%rowtype;
  reason text := nullif(btrim(remove_time_break.note), '');
begin
  -- Its shift first, then the break, as change_time_break.
  select tb.entry_id into shift from public.time_breaks tb where tb.id = time_break;
  if not found then
    raise exception 'Unknown break' using errcode = 'P0002';
  end if;
  select * into e from public.time_entries t where t.id = shift for update;
  select * into b from public.time_breaks tb where tb.id = time_break for update;
  if not found then
    raise exception 'Unknown break' using errcode = 'P0002';
  end if;

  perform private.check_time_clock_on(e.business_id);

  if not private.can_edit_clock(e.business_id, actor) then
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;

  if e.user_id = actor and not private.is_active_owner(e.business_id, actor) then
    raise exception 'Only an owner cancels or changes your own hours' using errcode = '42501';
  end if;

  if e.cancelled_at is not null then
    raise exception 'The shift is cancelled' using errcode = '55000';
  end if;

  if b.removed_at is not null then
    raise exception 'The break is removed' using errcode = '55000';
  end if;

  if b.ended_at is null then
    raise exception 'The break has not ended' using errcode = '55000', hint = 'break_open';
  end if;

  if reason is null then
    raise exception 'A break edit needs its reason' using errcode = '22023';
  end if;

  update public.time_breaks
  set removed_at = at_time, removed_by = actor
  where id = time_break;

  perform private.record_break_edit(
    actor, e, time_break, 'remove',
    jsonb_build_object('start', b.started_at, 'end', b.ended_at), null::jsonb,
    b.unpaid, reason, at_time
  );
end;
$$;

-- Whoever removed a break takes the removal back, within ten minutes (the
-- documents' window; after that, it is added again), with no reason. It comes
-- back as it was, or not at all: the shift may have been corrected since, and
-- a live break may have taken its time (the constraint, 23P01).
create function public.restore_time_break(
  actor uuid,
  time_break uuid,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  shift uuid;
  e public.time_entries%rowtype;
  b public.time_breaks%rowtype;
begin
  -- Its shift first, then the break, as change_time_break.
  select tb.entry_id into shift from public.time_breaks tb where tb.id = time_break;
  if not found then
    raise exception 'Unknown break' using errcode = 'P0002';
  end if;
  select * into e from public.time_entries t where t.id = shift for update;
  select * into b from public.time_breaks tb where tb.id = time_break for update;
  if not found then
    raise exception 'Unknown break' using errcode = 'P0002';
  end if;

  perform private.check_time_clock_on(e.business_id);

  if not private.can_edit_clock(e.business_id, actor) then
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;

  if e.user_id = actor and not private.is_active_owner(e.business_id, actor) then
    raise exception 'Only an owner cancels or changes your own hours' using errcode = '42501';
  end if;

  if e.cancelled_at is not null then
    raise exception 'The shift is cancelled' using errcode = '55000';
  end if;

  if b.removed_at is null then
    raise exception 'The break is not removed' using errcode = '55000';
  end if;

  if b.removed_by is distinct from actor or at_time - b.removed_at > interval '10 minutes' then
    raise exception 'Too late to bring it back' using errcode = '55000', hint = 'too_late';
  end if;

  perform private.check_break_fits(e, b.started_at, b.ended_at, at_time);

  update public.time_breaks
  set removed_at = null, removed_by = null
  where id = time_break;

  perform private.record_break_edit(
    actor, e, time_break, 'restore', null::jsonb,
    jsonb_build_object('start', b.started_at, 'end', b.ended_at),
    b.unpaid, null::text, at_time
  );
end;
$$;

------------------------------------------------------------------------------
-- 4. A removed break stays as it was

-- An entry's breaks stay inside it (20261110000100_hours_kept.sql's), the
-- same, for live breaks only: a removed one keeps its times, wherever the
-- shift moves or ends, as the record of what was removed. It is never moved,
-- cut, deleted or logged as a trim.
create or replace function private.fit_breaks_to_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed jsonb;
  corrector uuid;
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
    where b.entry_id = new.id and b.removed_at is null;
    set constraints public.time_breaks_no_overlap immediate;
    return null;
  end if;

  -- What the delete and the update below are about to do, for the log.
  select jsonb_agg(
      jsonb_build_object(
        'break', b.id,
        'from', jsonb_build_object('start', b.started_at, 'end', b.ended_at),
        'to', case
          when b.started_at >= coalesce(new.clock_out, 'infinity'::timestamptz)
            or b.ended_at <= new.clock_in
            then null
          else jsonb_build_object(
            'start', greatest(b.started_at, new.clock_in),
            'end', case
              when new.clock_out is null then b.ended_at
              else least(coalesce(b.ended_at, new.clock_out), new.clock_out)
            end
          )
        end
      )
      order by b.started_at
    )
  into changed
  from public.time_breaks b
  where b.entry_id = new.id
    and b.removed_at is null
    and (
      b.started_at >= coalesce(new.clock_out, 'infinity'::timestamptz)
      or b.ended_at <= new.clock_in
      or b.started_at < new.clock_in
      or (new.clock_out is not null and (b.ended_at is null or b.ended_at > new.clock_out))
    );

  perform set_config('ca.fit_breaks', new.id::text, true);

  delete from public.time_breaks b
  where b.entry_id = new.id
    and b.removed_at is null
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
    and b.removed_at is null
    and (
      b.started_at < new.clock_in
      or (new.clock_out is not null and (b.ended_at is null or b.ended_at > new.clock_out))
    );

  perform set_config('ca.fit_breaks', '', true);

  corrector := nullif(coalesce(current_setting('ca.correcting', true), ''), '')::uuid;
  if corrector is not null and jsonb_array_length(coalesce(changed, '[]'::jsonb)) > 0 then
    insert into public.audit_log (business_id, actor_id, action, details)
    values (
      new.business_id, corrector, 'clock.break_fit',
      jsonb_build_object('entry', new.id, 'person', new.user_id,
        'clock_in', new.clock_in, 'breaks', changed)
    );
  end if;

  return null;
end;
$$;

-- Taking a clock-out back (20261117000200_cancelled_shifts.sql's), the same,
-- but the break it opens again is a live one: a removed break that ends at
-- the clock-out stays ended.
create or replace function public.undo_clock_out(
  actor uuid,
  entry uuid,
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
  if not found or e.user_id <> actor then
    raise exception 'Unknown entry' using errcode = 'P0002';
  end if;

  perform private.check_on_clock(e.business_id, actor);

  if e.cancelled_at is not null then
    raise exception 'The shift is cancelled' using errcode = '55000';
  end if;

  if e.clock_out is null then
    raise exception 'Not clocked out' using errcode = '55000';
  end if;

  if e.source <> 'punch' or e.edited_at is not null
    or at_time - e.clock_out > interval '2 minutes' then
    raise exception 'Too late to take it back' using errcode = '55000';
  end if;

  update public.time_entries
  set clock_out = null, out_proof = null, out_station = null
  where id = entry;

  update public.time_breaks b
  set ended_at = null
  where b.entry_id = entry and b.ended_at = e.clock_out and b.removed_at is null;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (e.business_id, actor, 'clock.undo_out', jsonb_build_object('entry', entry));
end;
$$;

-- Cancelling a shift (20261117000200_cancelled_shifts.sql's), the same, but
-- only live breaks after the shift's first day hold a cancel back: the fit
-- leaves a removed one as it was, so the cancel takes nothing from it.
create or replace function public.cancel_time_entry(
  actor uuid,
  entry uuid,
  note text,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.time_entries%rowtype;
  reason text := nullif(btrim(cancel_time_entry.note), '');
  ended timestamptz;
  tz text;
  closed_text text;
begin
  select * into e from public.time_entries where id = entry for update;
  if not found then
    raise exception 'Unknown entry' using errcode = 'P0002';
  end if;

  perform private.check_time_clock_on(e.business_id);

  if not private.can_edit_clock(e.business_id, actor) then
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;

  if e.user_id = actor and not private.is_active_owner(e.business_id, actor) then
    raise exception 'Only an owner cancels or changes your own hours' using errcode = '42501';
  end if;

  if e.cancelled_at is not null then
    raise exception 'The shift is cancelled' using errcode = '55000';
  end if;

  if reason is null then
    raise exception 'A cancel needs its reason' using errcode = '22023';
  end if;

  -- The shift's day by the business's clock, as add_time_entry and
  -- correct_time_entry name it, kept only when its month is closed.
  select b.timezone into tz from public.businesses b where b.id = e.business_id;
  if private.month_closed(e.business_id, (e.clock_in at time zone tz)::date) then
    closed_text := to_char((e.clock_in at time zone tz)::date, 'YYYY-MM');
  end if;

  if e.clock_out is null then
    ended := least(at_time, e.clock_in + interval '24 hours');
    perform private.check_entry_times(e.clock_in, ended, at_time);

    -- A shift left open past its first day ends where that day does. A
    -- live break taken after it (a break has no day's limit) would be cut
    -- or lost by that end, and bringing the shift back couldn't return it,
    -- so the shift's end is corrected first (correct_time_entry, which logs
    -- what that does to its breaks). With no live break ending at or after
    -- the end, the only one ending there is the one this cancel ends; a
    -- removed break is never cut, so it holds nothing back. Its breaks are
    -- locked first, so a break ended at this moment (public.end_break,
    -- which locks the break) is seen ended, or refused.
    perform 1 from public.time_breaks b where b.entry_id = entry for update;
    if exists (
      select 1 from public.time_breaks b
      where b.entry_id = entry
        and b.removed_at is null
        and (b.started_at >= ended or b.ended_at >= ended)
    ) then
      raise exception 'The shift has breaks after its first day'
        using errcode = '55000', hint = 'breaks_after_day';
    end if;

    perform set_config('ca.correcting', actor::text, true);
    update public.time_entries
    set clock_out = ended,
      out_proof = 'manager',
      cancelled_at = at_time,
      cancelled_by = actor,
      cancel_reason = reason,
      cancelled_open = true,
      restored_at = null
    where id = entry;
    perform set_config('ca.correcting', '', true);
  else
    update public.time_entries
    set cancelled_at = at_time,
      cancelled_by = actor,
      cancel_reason = reason,
      cancelled_open = false,
      restored_at = null
    where id = entry;
  end if;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    e.business_id, actor, 'clock.cancel',
    jsonb_build_object('entry', entry, 'person', e.user_id,
      'clock_in', e.clock_in, 'clock_out', e.clock_out, 'note', reason)
    || case
      when ended is null then '{}'::jsonb
      else jsonb_build_object('ended_at', ended)
    end
    || case
      when closed_text is null then '{}'::jsonb
      else jsonb_build_object('closed_month', closed_text)
    end
  );
end;
$$;

-- Bringing a cancelled shift back (20261117000200_cancelled_shifts.sql's),
-- the same, but the break it opens again is the live one the cancel ended: a
-- removed break that ends at the cancel's end stays ended.
create or replace function public.restore_time_entry(
  actor uuid,
  entry uuid,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.time_entries%rowtype;
  tz text;
  closed_text text;
begin
  select * into e from public.time_entries where id = entry for update;
  if not found then
    raise exception 'Unknown entry' using errcode = 'P0002';
  end if;

  perform private.check_time_clock_on(e.business_id);

  if not private.can_edit_clock(e.business_id, actor) then
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;

  if e.user_id = actor and not private.is_active_owner(e.business_id, actor) then
    raise exception 'Only an owner cancels or changes your own hours' using errcode = '42501';
  end if;

  if e.cancelled_at is null then
    raise exception 'The shift is not cancelled' using errcode = '55000';
  end if;

  select b.timezone into tz from public.businesses b where b.id = e.business_id;
  if private.month_closed(e.business_id, (e.clock_in at time zone tz)::date) then
    closed_text := to_char((e.clock_in at time zone tz)::date, 'YYYY-MM');
  end if;

  if e.cancelled_open then
    -- Open again only for someone on the staff now: whoever left it, or
    -- moved off it, is never at work (remove_member, set_member_role and
    -- claim_invite refuse while someone is clocked in), and couldn't clock
    -- out. Their membership is held first, so a removal or a change of role
    -- at this moment (which lock it before asking whether they are at work)
    -- either comes first and is seen here, or waits and sees the shift open.
    perform 1 from public.memberships m
    where m.business_id = e.business_id and m.user_id = e.user_id
    for share;
    if not exists (
      select 1 from public.memberships m
      where m.business_id = e.business_id
        and m.user_id = e.user_id
        and m.active
        and private.is_staff_role(m.role)
    ) then
      raise exception 'The person is no longer on the staff'
        using errcode = '55000', hint = 'not_on_staff';
    end if;

    update public.time_entries
    set clock_out = null,
      out_proof = null,
      cancelled_at = null,
      cancelled_by = null,
      cancel_reason = null,
      cancelled_open = false,
      restored_at = at_time
    where id = entry;

    -- The break the cancel ended is open again: the only live one ending at
    -- the cancel's end, since the cancel refuses a shift with a live break
    -- ending at or after it, or starting after it. It can't overlap another
    -- live one, and nothing changes a cancelled shift's breaks meanwhile. A
    -- removed break ending there stays ended.
    update public.time_breaks b
    set ended_at = null
    where b.entry_id = entry and b.ended_at = e.clock_out and b.removed_at is null;
  else
    update public.time_entries
    set cancelled_at = null,
      cancelled_by = null,
      cancel_reason = null,
      restored_at = at_time
    where id = entry;
  end if;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    e.business_id, actor, 'clock.restore',
    jsonb_build_object('entry', entry, 'person', e.user_id, 'clock_in', e.clock_in,
      'clock_out', case when e.cancelled_open then null else e.clock_out end,
      'reopened', e.cancelled_open)
    || case
      when closed_text is null then '{}'::jsonb
      else jsonb_build_object('closed_month', closed_text)
    end
  );
end;
$$;

------------------------------------------------------------------------------
-- 5. Payroll

-- 20261117000200_cancelled_shifts.sql's, the same, with a break edit of a
-- shift in a closed month (`closed_month`, which only an unpaid break's
-- carries) told as a correction there is: the month's closer and the
-- accountants (pay.after_close), back unread with each later change.
create or replace function private.notify_for_payroll(entry public.audit_log)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  person uuid;
  closed_text text;
  closer uuid;
begin
  case entry.action
  when 'payroll.close' then
    perform private.resolve_notifications(
      entry.business_id, 'payroll.month:' || (entry.details ->> 'month')
    );
    return;
  when 'clock.correct', 'clock.add', 'clock.cancel', 'clock.restore', 'clock.break_edit' then
    -- Each closed month the change touched, once.
    for closed_text in
      select distinct touched.closed_key
      from (
        values (entry.details ->> 'closed_month'), (entry.details ->> 'closed_from_month')
      ) as touched (closed_key)
      where touched.closed_key is not null
      order by touched.closed_key
    loop
      -- No row leaves `closer` null: the accountants are still told.
      select pm.closed_by into closer
      from public.payroll_months pm
      where pm.business_id = entry.business_id
        and pm.month = (closed_text || '-01')::date;
      perform private.notify(
        entry.business_id,
        array_remove(array[closer], null::uuid)
          || private.members_in(entry.business_id, '{accountant}'::public.member_role[]),
        'pay.after_close'::text,
        jsonb_build_object('month', closed_text),
        entry.actor_id, 'time_clock'::public.module_key, 'worker'::public.member_role,
        'pay.after_close:' || closed_text
      );
    end loop;
    return;
  else
    null;
  end case;

  if not (entry.details ? 'person') then
    return;
  end if;
  person := (entry.details ->> 'person')::uuid;

  case entry.action
  when 'permission.grant' then
    if entry.details ->> 'perm' is not distinct from 'clock.payroll' then
      perform private.notify(
        entry.business_id, array[person], 'access.pay_granted', '{}'::jsonb,
        entry.actor_id, 'time_clock'::public.module_key, 'worker'::public.member_role,
        'access.pay:' || person::text
      );
    end if;
  when 'permission.revoke' then
    if entry.details ->> 'perm' is not distinct from 'clock.payroll' then
      perform private.resolve_notifications(entry.business_id, 'access.pay:' || person::text);
    end if;
  when 'wage.set' then
    perform private.notify(
      entry.business_id, array[person], 'pay.wage_set',
      jsonb_build_object('since', entry.details ->> 'effective_from'),
      entry.actor_id, 'time_clock'::public.module_key, 'worker'::public.member_role,
      'wage:' || person::text
    );
  else
    null;
  end case;
end;
$$;

-- 20261117000200_cancelled_shifts.sql's trigger, the same, with the break edit.
drop trigger audit_log_notifies_payroll on public.audit_log;
create trigger audit_log_notifies_payroll
  after insert on public.audit_log
  for each row
  when (
    new.action in ('permission.grant', 'permission.revoke', 'wage.set', 'payroll.close')
    or (
      new.action in (
        'clock.correct', 'clock.add', 'clock.cancel', 'clock.restore', 'clock.break_edit'
      )
      and new.details ?| array['closed_month', 'closed_from_month']::text[]
    )
  )
  execute function private.notify_payroll_from_log();

------------------------------------------------------------------------------
-- Who may call what

-- With the secret key only, for `actor`.
revoke execute on function public.add_time_break(uuid, uuid, timestamptz, timestamptz, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.add_time_break(uuid, uuid, timestamptz, timestamptz, text, timestamptz)
  to service_role;
revoke execute on function public.change_time_break(uuid, uuid, timestamptz, timestamptz, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.change_time_break(uuid, uuid, timestamptz, timestamptz, text, timestamptz)
  to service_role;
revoke execute on function public.remove_time_break(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.remove_time_break(uuid, uuid, text, timestamptz)
  to service_role;
revoke execute on function public.restore_time_break(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.restore_time_break(uuid, uuid, timestamptz)
  to service_role;

-- Replaced in place: the same signatures, so their grants stay; revoked (and
-- granted to the secret key) again all the same.
revoke execute on function public.undo_clock_out(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.undo_clock_out(uuid, uuid, timestamptz) to service_role;
revoke execute on function public.cancel_time_entry(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.cancel_time_entry(uuid, uuid, text, timestamptz)
  to service_role;
revoke execute on function public.restore_time_entry(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.restore_time_entry(uuid, uuid, timestamptz)
  to service_role;

-- The rest run inside the functions above and the log's trigger, as their
-- owner.
revoke execute on function private.check_break_fits(public.time_entries, timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated, service_role;
revoke execute on function private.record_break_edit(uuid, public.time_entries, uuid, text, jsonb, jsonb, boolean, text, timestamptz)
  from public, anon, authenticated, service_role;
revoke execute on function private.fit_breaks_to_entry()
  from public, anon, authenticated;
revoke execute on function private.notify_for_payroll(public.audit_log)
  from public, anon, authenticated;
