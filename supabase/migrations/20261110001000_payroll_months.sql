-- Closing a month (payroll P9; Orel, 8 and 9 November 2026, issue #1): once a
-- month's pay is done, the owner or an accountant closes it. The month keeps
-- what the hours engine gave then, so a later correction shows as a
-- difference from it, in the next month's file for payroll. Hours are facts:
-- a closed month still takes corrections, and says so.
--
--   the month   public.payroll_months: a business's month, closed by whom and
--               when, reopened by whom, when and why, and what the engine gave
--               when it closed (`snapshot`: the month by rate without amounts,
--               with the settings, the business's place and the people's
--               details it used) and the engine's version. Read by pay holders and a view as an
--               accountant; written only by the two functions below; deleted
--               only by the demo reset's purge.
--   closing     public.close_payroll_month, with the secret key for `actor`:
--               an owner or an accountant only (closing ends the month for
--               everyone), never another pay holder. The month must have
--               ended in the business's own time zone (22023); a month closed
--               already is 23505. A reopened month closes again, anew.
--   reopening   public.reopen_payroll_month: the owner or an accountant, with
--               a reason (22023 without). Both are logged, payroll.close and
--               payroll.reopen, pay rows.
--   hours       correct_time_entry and add_time_entry (20261110000100_hours_kept.sql's)
--               still take a shift of a closed month, and its log row gains
--               `closed_month` ('YYYY-MM'), and `closed_from_month` too for a
--               shift moved from one closed month into another. Each month's
--               closer and the accountants are told, one line per month
--               (pay.after_close).
--   wages       set_hourly_wage (20261110000600_payroll_details.sql's) refuses
--               a wage from a day of a closed month (55000): it would change
--               what was paid.
--   reminder    private.payroll_tick, daily at 06:00 UTC (the job `payroll`,
--               off locally and in CI, as the notifications' jobs are): on the
--               2nd of a business's month, last month not closed and holding
--               hours, its pay holders are told (pay.month_due), with how many
--               shifts wait or are open, never for a demo business. Closing
--               the month settles the line.
--   demo        the reset's purge (20261110000600_payroll_details.sql's) deletes
--               the business's months too.

------------------------------------------------------------------------------
-- 1. The months

create table public.payroll_months (
  business_id uuid not null references public.businesses (id) on delete restrict,
  -- The month's first day.
  month date not null check (extract(day from month) = 1),
  closed_by uuid references public.profiles (id) on delete set null,
  closed_at timestamptz not null,
  reopened_by uuid references public.profiles (id) on delete set null,
  reopened_at timestamptz,
  reopen_reason text check (
    reopen_reason is null
    or (char_length(reopen_reason) between 1 and 200 and reopen_reason = btrim(reopen_reason))
  ),
  -- What the engine gave when it closed, with the settings, the business's
  -- place and the people's details it used, so later corrections show as
  -- differences from it.
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  engine_version text not null check (char_length(btrim(engine_version)) between 1 and 40),
  primary key (business_id, month),
  check ((reopened_at is null) = (reopen_reason is null))
);

create index payroll_months_closed_by_idx on public.payroll_months (closed_by);
create index payroll_months_reopened_by_idx on public.payroll_months (reopened_by);

alter table public.payroll_months enable row level security;
revoke all on public.payroll_months from anon, authenticated;
-- Written only through the functions below (and the purge); a truncate would
-- skip the trigger that keeps them.
revoke insert, update, delete, truncate on public.payroll_months from service_role;
grant select on public.payroll_months to authenticated;

create policy "pay holders read the business's closed months"
  on public.payroll_months for select to authenticated
  using (
    private.module_enabled(business_id, 'time_clock'::public.module_key)
    and (
      private.has_perm(business_id, 'clock.payroll'::text)
      or private.viewing_payroll(business_id)
    )
  );

-- Kept as the other payroll records are (20261110000600_payroll_details.sql):
-- nothing deletes one but a purge that names the business.
create trigger payroll_months_kept before delete on public.payroll_months
  for each row execute function private.refuse_payroll_record_delete();

comment on table public.payroll_months is
  'A business''s months whose pay is done: closed by the owner or an accountant, with what the hours engine gave then (snapshot, without amounts) and its version, reopened with a reason. Read by pay holders (clock.payroll); written only by public.close_payroll_month and public.reopen_payroll_month; deleted only by a demo reset (private.purge_business_records).';

-- `person` closes and reopens the business's months: an active owner or
-- accountant. Not every pay holder: closing ends the month for everyone.
create function private.closes_payroll(business uuid, person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.business_id = closes_payroll.business
      and m.user_id = closes_payroll.person
      and m.active
      and m.role in ('owner'::public.member_role, 'accountant'::public.member_role)
  )
$$;

-- The month `on_day` is in is closed for the business, and not reopened.
create function private.month_closed(business uuid, on_day date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.payroll_months pm
    where pm.business_id = month_closed.business
      and pm.month = date_trunc('month', month_closed.on_day::timestamp)::date
      and pm.reopened_at is null
  )
$$;

------------------------------------------------------------------------------
-- 2. Closing and reopening

-- Close the month `for_month` is in (any day of it), for `actor`, with the
-- secret key. `closed_snapshot` is what the hours engine gave for it, with the
-- settings, the business's place and the people's details it used (the app's
-- @domain/payroll-diff), and `with_engine` the engine's version. The parameters are named apart from
-- payroll_months' columns (month, snapshot, engine_version). A month reopened
-- closes again, its reopening cleared: the log keeps both.
create function public.close_payroll_month(
  actor uuid,
  business uuid,
  for_month date,
  closed_snapshot jsonb,
  with_engine text,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  closed_on timestamptz := coalesce(at_time, now());
  tz text;
  closing date;
  engine text := btrim(coalesce(with_engine, ''));
  changed integer;
begin
  perform private.check_time_clock_on(business);

  if actor is null or not private.closes_payroll(business, actor) then
    raise exception 'Only an owner or an accountant closes a month' using errcode = '42501';
  end if;

  if for_month is null then
    raise exception 'Say which month' using errcode = '22023';
  end if;

  if jsonb_typeof(closed_snapshot) is distinct from 'object' then
    raise exception 'A closed month keeps what the hours engine gave' using errcode = '22023';
  end if;

  if char_length(engine) not between 1 and 40 then
    raise exception 'Say which hours engine worked it out' using errcode = '22023';
  end if;

  select b.timezone into tz from public.businesses b where b.id = business;
  closing := date_trunc('month', for_month::timestamp)::date;

  -- Ended by the business's own clock: its last day is behind it.
  if (closing + interval '1 month')::date > (closed_on at time zone tz)::date then
    raise exception 'The month has not ended yet' using errcode = '22023';
  end if;

  insert into public.payroll_months as pm (
    business_id, month, closed_by, closed_at, snapshot, engine_version
  )
  values (business, closing, actor, closed_on, closed_snapshot, engine)
  on conflict (business_id, month) do update
  set closed_by = excluded.closed_by,
    closed_at = excluded.closed_at,
    reopened_by = null,
    reopened_at = null,
    reopen_reason = null,
    snapshot = excluded.snapshot,
    engine_version = excluded.engine_version
  where pm.reopened_at is not null;
  get diagnostics changed = row_count;

  if changed = 0 then
    raise exception 'The month is closed already' using errcode = '23505';
  end if;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, actor, 'payroll.close',
    jsonb_build_object('month', to_char(closing, 'YYYY-MM'), 'engine', engine)
  );
end;
$$;

-- Reopen a closed month, for `actor`, with the secret key, saying why (`why`,
-- 1 to 200 characters once trimmed; 22023 without). P0002 for a month that
-- isn't closed.
create function public.reopen_payroll_month(
  actor uuid,
  business uuid,
  for_month date,
  why text,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_reason text := nullif(btrim(coalesce(why, '')), '');
  opening date;
begin
  perform private.check_time_clock_on(business);

  if actor is null or not private.closes_payroll(business, actor) then
    raise exception 'Only an owner or an accountant reopens a month' using errcode = '42501';
  end if;

  if for_month is null then
    raise exception 'Say which month' using errcode = '22023';
  end if;

  if clean_reason is null then
    raise exception 'Reopening a month needs its reason' using errcode = '22023';
  end if;

  if char_length(clean_reason) > 200 then
    raise exception 'A reason is at most 200 characters' using errcode = '22023';
  end if;

  opening := date_trunc('month', for_month::timestamp)::date;

  update public.payroll_months pm
  set reopened_by = actor,
    reopened_at = coalesce(at_time, now()),
    reopen_reason = clean_reason
  where pm.business_id = business
    and pm.month = opening
    and pm.reopened_at is null;
  if not found then
    raise exception 'The month is not closed' using errcode = 'P0002';
  end if;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, actor, 'payroll.reopen',
    jsonb_build_object('month', to_char(opening, 'YYYY-MM'), 'reason', clean_reason)
  );
end;
$$;

------------------------------------------------------------------------------
-- 3. Wages: never into a closed month

-- public.set_hourly_wage of 20261110000600_payroll_details.sql, with one
-- check more: a wage from a day of a closed month would change what was
-- paid, so it is refused (55000) until the month is reopened.
create or replace function public.set_hourly_wage(
  actor uuid,
  business uuid,
  person uuid,
  agorot integer,
  from_day date,
  wage_note text default null,
  at_time timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  person_role public.member_role;
  clean_note text := nullif(btrim(coalesce(wage_note, '')), '');
  set_on timestamptz := coalesce(at_time, now());
  local_today date;
  was_agorot integer;
  floor_agorot integer;
  first_start date;
  first_source text;
  wage_id uuid;
begin
  perform private.check_time_clock_on(business);

  if actor is null or not private.holds_perm(business, actor, 'clock.payroll') then
    raise exception 'Pay holders only' using errcode = '42501';
  end if;

  if person is not distinct from actor then
    raise exception 'Someone else sets your own wage' using errcode = '42501';
  end if;

  -- Active or not: someone who left is still paid for their last months.
  select m.role into person_role
  from public.memberships m
  where m.business_id = business and m.user_id = person;
  if person_role is null then
    raise exception 'Not in the team' using errcode = 'P0002';
  end if;

  if not private.is_staff_role(person_role) then
    raise exception 'An accountant has no hours here' using errcode = '22023';
  end if;

  if person_role = 'owner' and not private.is_active_owner(business, actor) then
    raise exception 'Only an owner sets an owner''s wage' using errcode = '42501';
  end if;

  if agorot is null or agorot not between 1 and 100000 then
    raise exception 'A wage is 0.01 to 1,000.00' using errcode = '22023';
  end if;

  if clean_note is not null and char_length(clean_note) > 200 then
    raise exception 'A note is at most 200 characters' using errcode = '22023';
  end if;

  select (set_on at time zone b.timezone)::date into local_today
  from public.businesses b
  where b.id = business;

  if from_day is null
    or from_day < (date_trunc('month', local_today::timestamp) - interval '1 month')::date
  then
    raise exception 'From the start of last month at the earliest' using errcode = '22023';
  end if;

  if from_day > (local_today + interval '12 months')::date then
    raise exception 'At most a year ahead' using errcode = '22023';
  end if;

  if private.month_closed(business, from_day) then
    raise exception 'The month is closed' using errcode = '55000';
  end if;

  select p.started_on, p.source into first_start, first_source
  from public.employment_periods p
  where p.business_id = business and p.user_id = person
  order by p.started_on
  limit 1;
  if first_source = 'set' and from_day < first_start then
    raise exception 'Before they started' using errcode = '22023';
  end if;

  was_agorot := private.wage_on(business, person, from_day);
  floor_agorot := private.minimum_wage_for(business, person, from_day);

  insert into public.member_wages (
    business_id, user_id, hourly_agorot, effective_from, note, set_by, set_at
  )
  values (business, person, agorot, from_day, clean_note, actor, set_on)
  returning id into wage_id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, actor, 'wage.set',
    jsonb_build_object(
      'person', person, 'wage', wage_id,
      'from_agorot', was_agorot, 'to_agorot', agorot,
      'effective_from', from_day, 'minimum_agorot', floor_agorot,
      'note', clean_note
    )
  );

  return wage_id;
end;
$$;

------------------------------------------------------------------------------
-- 4. Hours are facts: corrections into a closed month go through, and say so

-- A manager adds an entry, with why (20261110000100_hours_kept.sql's). One
-- whose day, by the business's clock, falls in a closed month is still
-- added; its log row names that month (`closed_month`), for the line to the
-- month's closer and accountants and the next month's file.
create or replace function public.add_time_entry(
  actor uuid,
  business uuid,
  person uuid,
  new_clock_in timestamptz,
  new_clock_out timestamptz,
  note text default null,
  at_time timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry_id uuid;
  proof text;
  tz text;
  closed_text text;
begin
  perform private.check_time_clock_on(business);

  if not private.can_edit_clock(business, actor) then
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.memberships m
    where m.business_id = business and m.user_id = person
  ) then
    raise exception 'Not a member of the business' using errcode = '42501';
  end if;

  if nullif(btrim(add_time_entry.note), '') is null then
    raise exception 'A correction needs its reason' using errcode = '22023';
  end if;

  perform private.check_entry_times(new_clock_in, new_clock_out, at_time);

  proof := case
    when person = actor and not private.is_active_owner(business, actor) then 'self'
    else 'manager'
  end;

  select b.timezone into tz from public.businesses b where b.id = business;
  if private.month_closed(business, (new_clock_in at time zone tz)::date) then
    closed_text := to_char((new_clock_in at time zone tz)::date, 'YYYY-MM');
  end if;

  insert into public.time_entries (
    business_id, user_id, clock_in, clock_out, source, note, edited_by, edited_at,
    in_proof, out_proof
  )
  values (
    business, person, new_clock_in, new_clock_out, 'manager',
    btrim(add_time_entry.note), actor, at_time,
    proof, case when new_clock_out is null then null else proof end
  )
  returning id into entry_id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, actor, 'clock.add',
    jsonb_build_object('entry', entry_id, 'person', person,
      'clock_in', new_clock_in, 'clock_out', new_clock_out, 'proof', proof,
      'note', btrim(add_time_entry.note))
    || case
      when closed_text is null then '{}'::jsonb
      else jsonb_build_object('closed_month', closed_text)
    end
  );

  return entry_id;
end;
$$;

-- A manager changes an entry's times, with why (20261110000100_hours_kept.sql's).
-- A shift whose day, before or after the change, falls in a closed month is
-- still corrected; its log row names that month (`closed_month`: the new
-- day's when it is closed, else the old day's). A shift moved from one closed
-- month into another changed both: the row names the old day's month as well
-- (`closed_from_month`), and both months' closers are told.
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

------------------------------------------------------------------------------
-- 5. The lines

-- Payroll's lines (20261110000500_hourly_wages.sql's, with the month closed):
-- a personal grant of clock.payroll tells the person and taking it back
-- settles the line, and a wage set tells its person, as before. Now also:
--   payroll.close              settles the month's reminder (pay.month_due),
--                              for everyone it reached
--   clock.correct, clock.add   of a closed month (`closed_month`, and
--                              `closed_from_month` for a shift moved between
--                              two): each month's closer and the business's
--                              accountants are told (pay.after_close), one
--                              line per month, back unread with each later
--                              change
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
  when 'clock.correct', 'clock.add' then
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

-- 20261110000500_hourly_wages.sql's list, with the close and the corrections
-- of a closed month (only those: the rest of the clock's rows are
-- private.notify_for's).
drop trigger audit_log_notifies_payroll on public.audit_log;
create trigger audit_log_notifies_payroll
  after insert on public.audit_log
  for each row
  when (
    new.action in ('permission.grant', 'permission.revoke', 'wage.set', 'payroll.close')
    or (
      new.action in ('clock.correct', 'clock.add')
      and new.details ?| array['closed_month', 'closed_from_month']::text[]
    )
  )
  execute function private.notify_payroll_from_log();

------------------------------------------------------------------------------
-- 6. The reminder

-- Once a day (the job `payroll` below): for each business whose own day at
-- `at_time` is the 2nd of its month, with the time clock on, not a demo, and
-- last month holding hours and not closed, its pay holders are told
-- (pay.month_due), with how many of last month's shifts wait for a
-- confirmation and how many are still open: counts only. One line per person
-- per month: asked again, it isn't told again. A demo business never gets
-- it. Returns how many lines it wrote.
create function private.payroll_tick(at_time timestamptz default now())
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
    -- private.notify_for's clock.confirm lines).
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
      and e.clock_in < ((due.last_month + interval '1 month') at time zone due.tz);

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

-- 06:00 UTC: 08:00 or 09:00 in Israel. Every time zone meets its own 2nd at
-- exactly one of these runs. supabase/seed.sql switches it off locally and
-- in CI, as it does the notifications' jobs; the tests call it themselves.
select cron.schedule('payroll', '0 6 * * *', $$select private.payroll_tick()$$);

------------------------------------------------------------------------------
-- 7. The demo reset's purge: 20261110000600_payroll_details.sql's, with the
--    months before the log.

create or replace function private.purge_business_records(business uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior text := current_setting('ca.records_purge', true);
begin
  if business is null then
    return;
  end if;
  perform set_config('ca.records_purge', business::text, true);
  delete from public.time_breaks b where b.business_id = business;
  delete from public.time_entries e where e.business_id = business;
  delete from public.member_wages w where w.business_id = business;
  delete from public.member_payroll_details d where d.business_id = business;
  delete from public.employment_periods p where p.business_id = business;
  delete from public.payroll_months pm where pm.business_id = business;
  delete from public.audit_log a where a.business_id = business;
  perform set_config('ca.records_purge', coalesce(prior, ''), true);
end;
$$;

------------------------------------------------------------------------------
-- Who may call what

-- Months are closed and reopened with the secret key only, for `actor`.
revoke execute on function public.close_payroll_month(uuid, uuid, date, jsonb, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.close_payroll_month(uuid, uuid, date, jsonb, text, timestamptz)
  to service_role;
revoke execute on function public.reopen_payroll_month(uuid, uuid, date, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.reopen_payroll_month(uuid, uuid, date, text, timestamptz)
  to service_role;

-- Replaced above; their grants stay as before.
revoke execute on function public.set_hourly_wage(uuid, uuid, uuid, integer, date, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.set_hourly_wage(uuid, uuid, uuid, integer, date, text, timestamptz)
  to service_role;

-- The rest run inside the functions, triggers, reset and job above, as their
-- owner.
revoke execute on function private.closes_payroll(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.month_closed(uuid, date) from public, anon, authenticated;
revoke execute on function private.notify_for_payroll(public.audit_log)
  from public, anon, authenticated;
revoke execute on function private.payroll_tick(timestamptz)
  from public, anon, authenticated, service_role;
revoke execute on function private.purge_business_records(uuid)
  from public, anon, authenticated, service_role;
