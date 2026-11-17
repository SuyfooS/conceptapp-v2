-- Time clock: a wrong shift is cancelled, not deleted (the clock plan's PR1;
-- ROADMAP: a wrong shift "מסומנת כבטלה עם מי, מתי ולמה, במקום שתימחק").
-- Someone who edits the clock marks a shift cancelled, with who, when and why,
-- and can bring it back at any time. The row and its breaks stay (hours are
-- kept, 20261110000100_hours_kept.sql), and so do the log rows. Nothing in
-- the app calls these yet: the reads (PR3) leave cancelled shifts out of
-- every count first, then the person's page (PR4) cancels.
--
--   columns     time_entries gains cancelled_at, cancelled_by, cancel_reason
--               (1 to 200 characters, trimmed, as `note`), cancelled_open
--               and restored_at. A reason goes with every cancel and only
--               with one; cancelled_by may go to null when that profile goes,
--               as confirmed_by does, while cancelled_at stays.
--   closed      a cancelled shift always has an end: one still open is
--               ended by its cancel, at that moment or a day after it began,
--               whichever is first (cancelled_open), as a correction would
--               end it, its breaks fitted and logged as a correction's are
--               (clock.break_fit, `ca.correcting`). So everything that asks
--               whether someone is at work (`clock_out is null`: clock_in,
--               clock_out, the breaks, the team's guards, the reminders) is
--               right without a change, and the person can clock in again.
--               One with a break starting or ending at or after that end (a
--               break after its first day) is refused (55000, hint
--               'breaks_after_day'): its end is corrected first, so a cancel
--               never cuts or loses a break that a restore couldn't give back.
--   overlap     time_entries_no_overlap, the same name, counts live shifts
--               only: the right shift can be added over a cancelled one.
--               Bringing one back over a live one of the same person is then
--               refused by the constraint (23P01), and so is bringing back an
--               open one while the person is clocked in again.
--   cancelling  public.cancel_time_entry(actor, entry, note, at_time), with
--               the secret key, for `actor`: someone who edits the clock
--               (private.can_edit_clock, 42501), never their own shift but
--               an owner (42501, "your own hours", the rule of confirming
--               one's own), a shift not cancelled already (55000) and a
--               reason (22023). Logged clock.cancel {entry, person, clock_in,
--               clock_out (null when open), ended_at (the end it set, when
--               open), note}, with closed_month when the shift's day by the
--               business's clock is in a closed month, as a correction is.
--   restoring   public.restore_time_entry(actor, entry, at_time): the same
--               rules, a cancelled shift (55000 otherwise) and no reason. One
--               the cancel ended is open again, with the break it ended (the
--               only one ending at the cancel's end), and only for someone on
--               the staff now (55000, hint 'not_on_staff'): whoever left it
--               is never at work. restored_at keeps when. Logged
--               clock.restore {entry, person, clock_in, clock_out, reopened},
--               with closed_month as above.
--   guards      correct_time_entry, confirm_time_entry and undo_clock_out
--               refuse a cancelled shift (55000, "The shift is cancelled"):
--               it is brought back first, and the end a cancel set is no
--               clock-out to take back.
--   lines       a cancel settles the shift's clock.confirm for everyone
--               (private.notify_for) and its clock.open and clock.overdue
--               (private.resolve_reminders_for); a restore goes through
--               notify_for's rule again, so a confirmation still waiting comes
--               back to those who confirm it. A reminder a cancel settled
--               doesn't come back with the shift. In a closed month, both tell
--               the month's closer and the accountants (pay.after_close,
--               private.notify_for_payroll). The log's triggers take the new
--               actions.
--   reminder    private.payroll_tick counts live shifts only: a month whose
--               shifts were all cancelled has nothing to close.
--
-- The server role keeps its table privileges on time_entries and time_breaks:
-- supabase/tests/database/time_breaks.test.sql still writes a break directly
-- as the server, so revoking them waits for its own change. The app writes
-- hours only through these functions.

------------------------------------------------------------------------------
-- 1. The columns

alter table public.time_entries
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references public.profiles (id) on delete set null,
  add column cancel_reason text check (
    char_length(cancel_reason) between 1 and 200 and cancel_reason = btrim(cancel_reason)
  ),
  add column cancelled_open boolean not null default false,
  add column restored_at timestamptz,
  add constraint time_entries_cancel_reason check ((cancelled_at is null) = (cancel_reason is null)),
  -- A canceller always has a time; the time stays if the canceller is deleted.
  add constraint time_entries_cancelled_by check (cancelled_by is null or cancelled_at is not null),
  add constraint time_entries_cancelled_open check (not cancelled_open or cancelled_at is not null),
  add constraint time_entries_cancelled_ended check (cancelled_at is null or clock_out is not null),
  add constraint time_entries_cancelled_restored check (cancelled_at is null or restored_at is null);

create index time_entries_cancelled_by_idx on public.time_entries (cancelled_by);

-- Live shifts never overlap; a cancelled one makes way.
alter table public.time_entries
  drop constraint time_entries_no_overlap,
  add constraint time_entries_no_overlap exclude using gist (
    business_id with =,
    user_id with =,
    tstzrange(clock_in, coalesce(clock_out, 'infinity'::timestamptz)) with &&
  ) where (cancelled_at is null);

comment on column public.time_entries.cancelled_at is
  'When the shift was cancelled (public.cancel_time_entry): it stays, with its breaks, and counts nowhere. Null for a live shift. A cancelled shift always has an end.';
comment on column public.time_entries.cancelled_by is
  'Who cancelled it; null once their profile goes, while cancelled_at stays.';
comment on column public.time_entries.cancel_reason is
  'Why it was cancelled, as the canceller wrote it (1 to 200 characters, trimmed). Set with cancelled_at and only with it.';
comment on column public.time_entries.cancelled_open is
  'The shift was still open when it was cancelled, and the cancel ended it: bringing it back (public.restore_time_entry) opens it again.';
comment on column public.time_entries.restored_at is
  'The last time a cancelled shift was brought back (public.restore_time_entry), for the payroll file''s changes since an export. Cleared by a new cancel.';

------------------------------------------------------------------------------
-- 2. Cancelling and bringing back

-- Someone who edits the clock cancels a shift, with why. One still open is
-- ended now, at most a day after it began, and the breaks that cuts are
-- logged as theirs (private.fit_breaks_to_entry under `ca.correcting`).
create function public.cancel_time_entry(
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
    -- break taken after it (a break has no day's limit) would be cut or
    -- lost by that end, and bringing the shift back couldn't return it, so
    -- the shift's end is corrected first (correct_time_entry, which logs
    -- what that does to its breaks). With nothing ending at or after the
    -- end, the only break ending there is the one this cancel ends. Its
    -- breaks are locked first, so a break ended at this moment
    -- (public.end_break, which locks the break) is seen ended, or refused.
    perform 1 from public.time_breaks b where b.entry_id = entry for update;
    if exists (
      select 1 from public.time_breaks b
      where b.entry_id = entry
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

-- Someone who edits the clock brings a cancelled shift back, as it was: one
-- the cancel ended is open again, with the break it ended. Over a live shift
-- of the same person, the no-overlap constraint refuses it (23P01).
create function public.restore_time_entry(
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

    -- The break the cancel ended is open again: the only one ending at the
    -- cancel's end, since the cancel refuses a shift with a break ending at
    -- or after it, or starting after it. It can't overlap another, and
    -- nothing changes a cancelled shift's breaks meanwhile.
    update public.time_breaks b
    set ended_at = null
    where b.entry_id = entry and b.ended_at = e.clock_out;
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
-- 3. A cancelled shift is brought back before anything else changes it

-- A manager changes an entry's times, with why
-- (20261110001000_payroll_months.sql's), the same, but never a cancelled
-- shift's: it is brought back first.
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
  by_owner boolean;
  in_moved boolean;
  out_moved boolean;
  new_in_proof text;
  new_out_proof text;
  tz text;
  closed_now text;
  closed_then text;
begin
  select * into e from public.time_entries where id = entry for update;
  if not found then
    raise exception 'Unknown entry' using errcode = 'P0002';
  end if;

  perform private.check_time_clock_on(e.business_id);

  if not private.can_edit_clock(e.business_id, actor) then
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;

  if e.cancelled_at is not null then
    raise exception 'The shift is cancelled' using errcode = '55000';
  end if;

  if new_clock_out is null and e.clock_out is not null then
    raise exception 'An entry that ended needs an end' using errcode = '22023';
  end if;

  if nullif(btrim(correct_time_entry.note), '') is null then
    raise exception 'A correction needs its reason' using errcode = '22023';
  end if;

  perform private.check_entry_times(new_clock_in, new_clock_out, at_time);

  if new_clock_out is null and at_time - new_clock_in > interval '24 hours' then
    raise exception 'An entry is at most 24 hours' using errcode = '22023';
  end if;

  by_owner := private.is_active_owner(e.business_id, actor);
  in_moved := new_clock_in is distinct from e.clock_in;
  out_moved := new_clock_out is distinct from e.clock_out;

  new_in_proof := case
    when not in_moved then e.in_proof
    when by_owner then 'manager'
    when e.user_id = actor or e.in_proof = 'self' then 'self'
    else 'manager'
  end;
  new_out_proof := case
    when not out_moved then e.out_proof
    when by_owner then 'manager'
    when e.user_id = actor or e.out_proof = 'self' then 'self'
    else 'manager'
  end;

  -- The new day's month and the old day's, by the business's clock, each
  -- kept only when it is closed.
  select b.timezone into tz from public.businesses b where b.id = e.business_id;
  if private.month_closed(e.business_id, (new_clock_in at time zone tz)::date) then
    closed_now := to_char((new_clock_in at time zone tz)::date, 'YYYY-MM');
  end if;
  if private.month_closed(e.business_id, (e.clock_in at time zone tz)::date) then
    closed_then := to_char((e.clock_in at time zone tz)::date, 'YYYY-MM');
  end if;

  perform set_config('ca.correcting', actor::text, true);
  update public.time_entries
  set clock_in = new_clock_in,
    clock_out = new_clock_out,
    note = btrim(correct_time_entry.note),
    edited_by = actor,
    edited_at = at_time,
    in_proof = new_in_proof,
    out_proof = new_out_proof,
    in_station = case when in_moved then null else time_entries.in_station end,
    out_station = case when out_moved then null else time_entries.out_station end,
    confirmed_by = case
      when (in_moved and new_in_proof = 'self') or (out_moved and new_out_proof = 'self')
        then null
      else time_entries.confirmed_by
    end,
    confirmed_at = case
      when (in_moved and new_in_proof = 'self') or (out_moved and new_out_proof = 'self')
        then null
      else time_entries.confirmed_at
    end
  where id = entry;
  perform set_config('ca.correcting', '', true);

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    e.business_id, actor, 'clock.correct',
    jsonb_build_object('entry', entry, 'person', e.user_id,
      'from', jsonb_build_object('clock_in', e.clock_in, 'clock_out', e.clock_out),
      'to', jsonb_build_object('clock_in', new_clock_in, 'clock_out', new_clock_out),
      'proof', jsonb_build_object('in', new_in_proof, 'out', new_out_proof),
      'note', btrim(correct_time_entry.note))
    || case
      when coalesce(closed_now, closed_then) is null then '{}'::jsonb
      else jsonb_build_object('closed_month', coalesce(closed_now, closed_then))
    end
    || case
      when closed_now is not null and closed_then is not null and closed_now <> closed_then
        then jsonb_build_object('closed_from_month', closed_then)
      else '{}'::jsonb
    end
  );
end;
$$;

-- A manager confirms an entry (20261108000300_sealed.sql's), the same, but
-- never a cancelled one: nothing of it waits.
create or replace function public.confirm_time_entry(
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
  by_owner boolean;
  arrival_open boolean;
  departure_open boolean;
begin
  select * into e from public.time_entries where id = entry for update;
  if not found then
    raise exception 'Unknown entry' using errcode = 'P0002';
  end if;

  perform private.check_time_clock_on(e.business_id);

  if not private.can_edit_clock(e.business_id, actor) then
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;

  by_owner := private.is_active_owner(e.business_id, actor);

  if e.user_id = actor and not by_owner then
    raise exception 'Someone else confirms your own hours' using errcode = '42501';
  end if;

  if e.cancelled_at is not null then
    raise exception 'The shift is cancelled' using errcode = '55000';
  end if;

  if coalesce(e.in_proof, '') not in ('none', 'self')
    and coalesce(e.out_proof, '') not in ('none', 'self') then
    raise exception 'Only an entry made without a code needs confirming' using errcode = '55000';
  end if;

  -- What is left to confirm: the arrival, until confirmed, and a departure
  -- that came after the last confirmation.
  arrival_open := coalesce(e.in_proof, '') in ('none', 'self') and e.confirmed_at is null;
  departure_open := coalesce(e.out_proof, '') in ('none', 'self')
    and coalesce(e.confirmed_at is null or e.confirmed_at < e.clock_out, false);

  if not (arrival_open or departure_open) then
    return;
  end if;

  if ((arrival_open and e.in_proof = 'self') or (departure_open and e.out_proof = 'self'))
    and not by_owner then
    raise exception 'Only an owner confirms hours someone set for themselves' using errcode = '42501';
  end if;

  update public.time_entries set confirmed_by = actor, confirmed_at = at_time where id = entry;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (e.business_id, actor, 'clock.confirm',
    jsonb_build_object('entry', entry, 'person', e.user_id));
end;
$$;

-- Taking a clock-out back (20261108000200_qr_clock.sql's), the same, but
-- never on a cancelled shift: the end a cancel set (within the two minutes,
-- when it ended an open shift) is no clock-out of the person's.
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
  where b.entry_id = entry and b.ended_at = e.clock_out;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (e.business_id, actor, 'clock.undo_out', jsonb_build_object('entry', entry));
end;
$$;

------------------------------------------------------------------------------
-- 4. Who is told

-- 20261115001300_roles_team.sql's, the same, with a cancel and a restore in
-- the clock's branch: a cancelled shift waits for nobody, so its
-- clock.confirm settles for everyone, and one brought back waits as
-- confirm_time_entry's rule says, its line back to those who confirm it,
-- unread, but for whoever brought it back. Its caller is the log's trigger,
-- made again below with the two actions.
create or replace function private.notify_for(entry public.audit_log)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d jsonb := entry.details;
  b uuid := entry.business_id;
  w public.shift_swaps%rowtype;
  e public.time_entries%rowtype;
  person uuid;
  gone jsonb;
  proof text;
  thing text;
  arrival_open boolean;
  departure_open boolean;
  leaving boolean;
  for_role public.member_role;
  for_perm text;
  recipients uuid[];
  facts jsonb;
  moment timestamptz;
  running boolean;
  ahead integer;
  until_at timestamptz;
  near jsonb;
  prior_near jsonb;
  prior_until timestamptz;
  prior_on boolean;
  prior_kept boolean;
  written integer;
begin
  case entry.action
  when 'schedule.publish' then
    -- The publish's moment and whether the week had begun then; a row
    -- without them (from before them) is of a week still to come.
    moment := coalesce((d ->> 'at')::timestamptz, entry.created_at);
    running := coalesce((d ->> 'running')::boolean, false);

    if coalesce((d ->> 'first')::boolean, false) then
      for person in
        select m.user_id from public.memberships m
        where m.business_id = b and m.active
      loop
        -- Under way: only someone with a shift still to start, how many, and
        -- on the phone until the first of them starts.
        if running then
          select h.shift_count, h.first_start into ahead, until_at
          from private.shifts_ahead(person, (d ->> 'week')::uuid, moment) h;
          continue when ahead = 0;
        else
          ahead := private.own_shift_count(person, (d ->> 'week')::uuid);
          until_at := null;
        end if;

        facts := jsonb_build_object(
          'week', d -> 'week',
          'startsOn', d -> 'starts_on',
          'mine', ahead
        );
        if running then
          facts := facts || jsonb_build_object('running', true);
        end if;

        perform private.notify(
          b, array[person], 'schedule.published'::text, facts,
          entry.actor_id, 'scheduling'::public.module_key, 'worker'::public.member_role,
          'schedule:' || (d ->> 'week'),
          push_until => until_at,
          at_time => moment
        );
      end loop;
    else
      for person in
        select c.value::uuid
        from jsonb_array_elements_text(coalesce(d -> 'changed', '[]'::jsonb)) as c (value)
      loop
        -- Under way: how many are left, and the nearest shift that changed,
        -- on the phone until it starts (or ends, once begun).
        near := null;
        until_at := null;
        if running then
          ahead := (
            select h.shift_count
            from private.shifts_ahead(person, (d ->> 'week')::uuid, moment) h
          );
          near := d -> 'nearest' -> person::text;
          if jsonb_typeof(near) = 'object' then
            until_at := (near ->> 'until')::timestamptz;
            near := jsonb_build_object(
              'change', near -> 'change', 'shift', near -> 'brief', 'from', near -> 'from'
            );
          else
            near := null;
          end if;

          -- The change their line names already, when they haven't heard of
          -- it yet: unread, and its push not gone (held for its two minutes,
          -- by quiet hours, or never to go, with no phone). Several publishes
          -- in a row then never lose a nearer one: it stays named while it
          -- still holds of them and its shift is ahead, unless this
          -- publish's own is nearer.
          select l.params -> 'nearest', l.push_before
          into prior_near, prior_until
          from public.notifications l
          where l.business_id = b
            and l.user_id = person
            and l.dedupe_key = 'schedule:' || (d ->> 'week')
            and l.kind = 'schedule.changed'
            and l.read_at is null
            and l.resolved_at is null
            and l.push_state not in ('sending', 'sent');
          prior_kept := false;
          if jsonb_typeof(prior_near) = 'object' and prior_until > moment then
            -- On a shift as it names it, now: what a move, an edit or an
            -- addition says still holds, and a removal holds while they
            -- aren't.
            prior_on := exists (
              select 1
              from public.shift_assignments a
              join public.schedule_shifts s on s.id = a.shift_id
              where s.week_id = (d ->> 'week')::uuid
                and a.user_id = person
                and s.day = (prior_near #>> '{shift,day}'::text[])::date
                and s.starts_at = (prior_near #>> '{shift,start}'::text[])::time
                and s.ends_at = (prior_near #>> '{shift,end}'::text[])::time
                and s.name = (prior_near #>> '{shift,name}'::text[])
            );
            -- Nearer as private.nearest_change orders: an edit after any
            -- other change, then by when each counts from.
            prior_kept := (case
                when prior_near ->> 'change' = 'removed' then not prior_on
                else prior_on
              end)
              and (
                near is null
                or ((prior_near ->> 'change') = 'edited', (prior_near ->> 'from')::timestamptz)
                  < ((near ->> 'change') = 'edited', (near ->> 'from')::timestamptz)
              );
          end if;
          if prior_kept then
            near := prior_near;
            until_at := prior_until;
          end if;
        else
          ahead := private.own_shift_count(person, (d ->> 'week')::uuid);
        end if;

        facts := jsonb_build_object(
          'week', d -> 'week',
          'startsOn', d -> 'starts_on',
          'mine', ahead
        );
        if running then
          facts := facts || jsonb_build_object('running', true);
        end if;
        if near is not null then
          facts := facts || jsonb_build_object('nearest', near);
        end if;

        written := private.notify(
          b, array[person], 'schedule.changed'::text, facts,
          entry.actor_id, 'scheduling'::public.module_key, 'worker'::public.member_role,
          'schedule:' || (d ->> 'week'),
          push_until => until_at,
          at_time => moment
        );

        -- On the phone two minutes after the publish, or when quiet hours
        -- end if later: a publish of the week before then replaces this
        -- push with its own, through the same line.
        if written > 0 then
          update public.notifications n
          set push_after = greatest(n.push_after, moment + interval '2 minutes')
          where n.business_id = b
            and n.user_id = person
            and n.dedupe_key = 'schedule:' || (d ->> 'week')
            and n.push_state = 'queued';
        end if;
      end loop;
      for gone in
        select c.value
        from jsonb_array_elements(coalesce(d -> 'removed_swaps', '[]'::jsonb)) as c (value)
      loop
        perform private.notify(
          b,
          array[(gone ->> 'requested_by')::uuid, (gone ->> 'taken_by')::uuid],
          'swap.removed',
          jsonb_build_object('swap', gone -> 'id', 'shift', gone -> 'shift'),
          entry.actor_id, 'scheduling', 'worker', 'swap:' || (gone ->> 'id')
        );
        perform private.resolve_notifications(b, 'swap.offer:' || (gone ->> 'id'));
        perform private.resolve_notifications(b, 'swap.approval:' || (gone ->> 'id'));
      end loop;
    end if;

  when 'swap.request' then
    select * into w from public.shift_swaps sw where sw.id = (d ->> 'swap')::uuid;
    if found then
      perform private.notify(
        b,
        array(
          select m.user_id from public.memberships m
          where m.business_id = b and m.active and m.user_id <> w.requested_by
            and private.can_take(w.shift_id, m.user_id)
        ),
        'swap.offered',
        jsonb_build_object(
          'swap', w.id,
          'shift', private.shift_brief(w.shift_id),
          'from', w.requested_by
        ),
        entry.actor_id, 'scheduling', 'worker', 'swap.offer:' || w.id
      );
    end if;

  when 'swap.take' then
    select * into w from public.shift_swaps sw where sw.id = (d ->> 'swap')::uuid;
    if found then
      perform private.notify(
        b, array[w.requested_by], 'swap.taken',
        jsonb_build_object(
          'swap', w.id,
          'shift', private.shift_brief(w.shift_id),
          'by', w.taken_by
        ),
        entry.actor_id, 'scheduling', 'worker', 'swap:' || w.id
      );
      -- To whoever decides it: those who build the schedule, but its asker
      -- when they don't publish it, who doesn't decide their own (the taker
      -- did this, and is left out as its actor).
      perform private.notify(
        b, private.members_holding(b, 'schedule.edit'::text),
        'swap.waiting',
        jsonb_build_object(
          'swap', w.id,
          'shift', private.shift_brief(w.shift_id),
          'from', w.requested_by,
          'to', w.taken_by
        ),
        entry.actor_id, 'scheduling', 'manager', 'swap.approval:' || w.id,
        leave_out => case
          when private.publishes_schedule(b, w.requested_by) then '{}'::uuid[]
          else array[w.requested_by]
        end,
        holders_of => 'schedule.edit'::text
      );
      perform private.resolve_notifications(b, 'swap.offer:' || w.id);
    end if;

  when 'swap.cancel' then
    select * into w from public.shift_swaps sw where sw.id = (d ->> 'swap')::uuid;
    if found then
      if w.taken_by is not null then
        perform private.notify(
          b, array[w.taken_by], 'swap.cancelled',
          jsonb_build_object(
            'swap', w.id,
            'shift', private.shift_brief(w.shift_id),
            'from', w.requested_by
          ),
          entry.actor_id, 'scheduling', 'worker', 'swap:' || w.id
        );
      end if;
      perform private.resolve_notifications(b, 'swap.offer:' || w.id);
      perform private.resolve_notifications(b, 'swap.approval:' || w.id);
    end if;

  when 'swap.approve', 'swap.decline' then
    perform private.notify(
      b,
      array[(d ->> 'from')::uuid, (d ->> 'to')::uuid],
      case entry.action when 'swap.approve' then 'swap.approved' else 'swap.declined' end,
      jsonb_build_object(
        'swap', d -> 'swap',
        'shift', private.shift_brief((d ->> 'shift')::uuid),
        'from', d -> 'from',
        'to', d -> 'to'
      ),
      entry.actor_id, 'scheduling', 'worker', 'swap:' || (d ->> 'swap')
    );
    perform private.resolve_notifications(b, 'swap.approval:' || (d ->> 'swap'));

  when 'clock.in', 'clock.out', 'clock.add', 'clock.correct', 'clock.undo_out',
    'clock.cancel', 'clock.restore' then
    select * into e from public.time_entries t where t.id = (d ->> 'entry')::uuid;
    if found then
      thing := 'clock.confirm:' || e.id;
      -- What is left to confirm, by the rule of confirm_time_entry: the arrival
      -- until confirmed, and a departure after the last confirmation. Hours
      -- someone set for themselves are an owner's to confirm. A cancelled
      -- shift waits for nobody; one brought back waits again as it did.
      arrival_open := coalesce(e.in_proof, '') in ('none', 'self') and e.confirmed_at is null;
      departure_open := coalesce(e.out_proof, '') in ('none', 'self')
        and coalesce(e.confirmed_at is null or e.confirmed_at < e.clock_out, false);
      proof := case
        when e.cancelled_at is not null then null
        when (arrival_open and e.in_proof = 'self') or (departure_open and e.out_proof = 'self')
          then 'self'
        when arrival_open or departure_open then 'none'
      end;
      if proof is null then
        -- Nothing left to confirm: an owner's correction, an undone clock-out,
        -- a cancel.
        perform private.resolve_notifications(b, thing);
      else
        -- Hours someone set for themselves stay with owners, by rank (critique
        -- 24): an owner confirms them. The rest go to those who edit the
        -- clock (private.members_holding, holders_of clock.edit), whatever
        -- their role, as a line for that permission; 'manager' stays its
        -- audience_role, the lowest role that holds it by default.
        for_role := (case proof when 'self' then 'owner' else 'manager' end)::public.member_role;
        for_perm := case proof when 'self' then null::text else 'clock.edit'::text end;
        recipients := case proof
          when 'self' then private.members_in(b, '{owner}'::public.member_role[])
          else private.members_holding(b, 'clock.edit'::text)
        end;
        -- The line tells a time that waits, whatever the action was: the
        -- departure, the later of the two, unless the arrival is what makes
        -- the hours an owner's.
        leaving := departure_open and (not arrival_open or e.out_proof = proof);
        facts := jsonb_build_object(
          'entry', e.id,
          'person', e.user_id,
          'proof', proof,
          'direction', case when leaving then 'out' else 'in' end,
          'at', case when leaving then e.clock_out else e.clock_in end
        );
        -- Anyone who may no longer confirm them (one who edits the clock, once
        -- the hours rest on someone's own word, or who no longer edits it) is
        -- done with them.
        perform private.resolve_notifications(b, thing, still_for => recipients);
        if entry.action = 'clock.undo_out' then
          -- The departure is gone and the arrival still waits: the lines say
          -- so without coming back unread, and anyone new to them gets one.
          update public.notifications n
          set params = facts, audience_role = for_role, audience_perm = for_perm
          where n.business_id = b and n.dedupe_key = thing and n.resolved_at is null;
          perform private.notify(
            b, recipients, 'clock.confirm', facts, entry.actor_id, 'time_clock',
            for_role, thing,
            realert => false,
            leave_out => array[e.user_id],
            holders_of => for_perm
          );
        elsif entry.action <> 'clock.out' or departure_open then
          -- A clock-out tells again only when the departure itself waits.
          perform private.notify(
            b, recipients, 'clock.confirm', facts,
            -- Whoever did it: the person, or the manager who corrected it.
            entry.actor_id, 'time_clock', for_role, thing,
            -- Never to the person whose hours they are.
            leave_out => array[e.user_id],
            holders_of => for_perm
          );
        end if;
      end if;
    end if;

  when 'clock.confirm' then
    perform private.resolve_notifications(b, 'clock.confirm:' || (d ->> 'entry'));

  when 'invite.claim' then
    -- To those who see the team (the roles plan's R6), whoever they are.
    perform private.notify(
      b, private.members_holding(b, 'team.view'::text),
      'team.joined',
      jsonb_build_object('person', entry.actor_id),
      entry.actor_id, null::public.module_key, 'manager',
      'team.joined:' || entry.actor_id,
      holders_of => 'team.view'::text
    );

  else
    null;
  end case;
end;
$$;

-- 20261109000450_notifications.sql's trigger, the same, with the two actions.
drop trigger audit_log_notifies on public.audit_log;
create trigger audit_log_notifies
  after insert on public.audit_log
  for each row
  when (new.action in (
    'schedule.publish', 'swap.request', 'swap.take', 'swap.cancel',
    'swap.approve', 'swap.decline', 'clock.in', 'clock.out', 'clock.add',
    'clock.correct', 'clock.undo_out', 'clock.confirm', 'clock.cancel',
    'clock.restore', 'invite.claim'
  ))
  execute function private.notify_from_log();

-- 20261112000200_reminders.sql's, the same, with a cancel: the shift has
-- ended, so neither its reminder to clock out (clock.open) nor its line to
-- those who edit the clock (clock.overdue) waits. A restore brings neither
-- back: their keys are settled, and the minute job never writes one twice.
create or replace function private.resolve_reminders_for(entry public.audit_log)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d jsonb := entry.details;
begin
  case entry.action
  when 'clock.out' then
    perform private.resolve_notifications(entry.business_id, 'clock.open:' || (d ->> 'entry'));
  when 'clock.correct' then
    perform private.resolve_notifications(
      entry.business_id, 'clock.overdue:' || (d ->> 'entry')
    );
    if exists (
      select 1 from public.time_entries t
      where t.id = (d ->> 'entry')::uuid and t.clock_out is not null
    ) then
      perform private.resolve_notifications(
        entry.business_id, 'clock.open:' || (d ->> 'entry')
      );
    end if;
  when 'clock.cancel' then
    -- The shift has ended (the cancel ended it, if it was open), and nobody
    -- is late with it.
    perform private.resolve_notifications(entry.business_id, 'clock.open:' || (d ->> 'entry'));
    perform private.resolve_notifications(
      entry.business_id, 'clock.overdue:' || (d ->> 'entry')
    );
  when 'schedule.publish' then
    -- After the minute job is done writing that week's, if it is.
    perform private.lock_availability_week(entry.business_id, (d ->> 'starts_on')::date);
    perform private.resolve_notifications(
      entry.business_id, 'availability:' || (d ->> 'starts_on')
    );
    perform private.resolve_notifications(
      entry.business_id, 'availability.missing:' || (d ->> 'starts_on')
    );
  else
    null;
  end case;
end;
$$;

-- 20261112000200_reminders.sql's trigger, the same, with the cancel.
drop trigger audit_log_resolves_reminders on public.audit_log;
create trigger audit_log_resolves_reminders
  after insert on public.audit_log
  for each row
  when (new.action in ('clock.out', 'clock.correct', 'clock.cancel', 'schedule.publish'))
  execute function private.resolve_reminders_from_log();

------------------------------------------------------------------------------
-- 5. Payroll

-- 20261110001000_payroll_months.sql's, the same, with a cancel and a restore
-- of a shift in a closed month (`closed_month`) told as a correction there
-- is: the month's closer and the accountants (pay.after_close), back unread
-- with each later change.
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
  when 'clock.correct', 'clock.add', 'clock.cancel', 'clock.restore' then
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

-- 20261110001000_payroll_months.sql's trigger, the same, with the two actions.
drop trigger audit_log_notifies_payroll on public.audit_log;
create trigger audit_log_notifies_payroll
  after insert on public.audit_log
  for each row
  when (
    new.action in ('permission.grant', 'permission.revoke', 'wage.set', 'payroll.close')
    or (
      new.action in ('clock.correct', 'clock.add', 'clock.cancel', 'clock.restore')
      and new.details ?| array['closed_month', 'closed_from_month']::text[]
    )
  )
  execute function private.notify_payroll_from_log();

-- 20261110001000_payroll_months.sql's, the same, counting live shifts only:
-- a cancelled shift is neither waiting nor open, and a month whose shifts
-- were all cancelled holds no hours to close.
create or replace function private.payroll_tick(at_time timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  due record;
  holders uuid[];
  shift_count integer;
  waiting_count integer;
  open_count integer;
  written integer := 0;
begin
  for due in
    select b.id as business_id, b.timezone as tz,
      (date_trunc('month', (at_time at time zone b.timezone)) - interval '1 month')::date
        as last_month
    from public.businesses b
    where extract(day from (at_time at time zone b.timezone)) = 2
      and private.module_enabled(b.id, 'time_clock'::public.module_key)
      and not exists (
        select 1 from private.demo_businesses d where d.business_id = b.id
      )
    order by b.id
  loop
    if private.month_closed(due.business_id, due.last_month) then
      continue;
    end if;

    -- Last month's shifts by the business's own days: how many, how many
    -- are still open, and how many wait for a confirmation (the rule of
    -- private.notify_for's clock.confirm lines), cancelled ones left out.
    select
      count(*)::integer,
      count(*) filter (where e.clock_out is null)::integer,
      count(*) filter (
        where (coalesce(e.in_proof, '') in ('none', 'self') and e.confirmed_at is null)
          or (
            coalesce(e.out_proof, '') in ('none', 'self')
            and coalesce(e.confirmed_at is null or e.confirmed_at < e.clock_out, false)
          )
      )::integer
    into shift_count, open_count, waiting_count
    from public.time_entries e
    where e.business_id = due.business_id
      and e.clock_in >= (due.last_month::timestamp at time zone due.tz)
      and e.clock_in < ((due.last_month + interval '1 month') at time zone due.tz)
      and e.cancelled_at is null;

    -- A month with no hours has nothing to close.
    if shift_count = 0 then
      continue;
    end if;

    holders := array(
      select m.user_id
      from public.memberships m
      where m.business_id = due.business_id
        and m.active
        and private.holds_perm(due.business_id, m.user_id, 'clock.payroll'::text)
      order by m.user_id
    );

    written := written + private.notify(
      due.business_id, holders, 'pay.month_due'::text,
      jsonb_build_object(
        'month', to_char(due.last_month, 'YYYY-MM'),
        'waiting', waiting_count,
        'open', open_count
      ),
      null::uuid, 'time_clock'::public.module_key, 'worker'::public.member_role,
      'payroll.month:' || to_char(due.last_month, 'YYYY-MM'),
      realert => false,
      at_time => at_time
    );
  end loop;

  return written;
end;
$$;

------------------------------------------------------------------------------
-- Who may call what

-- With the secret key only, for `actor`.
revoke execute on function public.cancel_time_entry(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.cancel_time_entry(uuid, uuid, text, timestamptz)
  to service_role;
revoke execute on function public.restore_time_entry(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.restore_time_entry(uuid, uuid, timestamptz)
  to service_role;

-- Replaced in place: the same signatures, so their grants stay; revoked (and
-- the writes granted to the secret key) again all the same.
revoke execute on function public.correct_time_entry(uuid, uuid, timestamptz, timestamptz, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.correct_time_entry(uuid, uuid, timestamptz, timestamptz, text, timestamptz)
  to service_role;
revoke execute on function public.confirm_time_entry(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.confirm_time_entry(uuid, uuid, timestamptz) to service_role;
revoke execute on function public.undo_clock_out(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.undo_clock_out(uuid, uuid, timestamptz) to service_role;

-- The rest run inside the triggers and the job above, as their owner.
revoke execute on function private.notify_for(public.audit_log)
  from public, anon, authenticated;
revoke execute on function private.resolve_reminders_for(public.audit_log)
  from public, anon, authenticated;
revoke execute on function private.notify_for_payroll(public.audit_log)
  from public, anon, authenticated;
revoke execute on function private.payroll_tick(timestamptz)
  from public, anon, authenticated, service_role;
