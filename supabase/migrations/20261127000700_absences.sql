-- Time clock: vacation, sick leave and reserve duty (docs/ROADMAP.md, known
-- issue 19; for an existing business, day to day, Orel, 22 November 2026).
-- Someone who edits the clock records that a person on the staff is away, from
-- one day to another, as vacation, sick leave, reserve duty or another
-- absence, with a note if they like. The engine then never counts those days
-- as days worked, the schedule builder sees who is away, and payroll's file
-- lists them by kind. What they come to in pay stays with the accountant
-- (known issue 18): the app counts days, never amounts.
--
--   the table   public.absences: whole days, from_day to to_day included, at
--               most 366 days a record, one kind (vacation, sick, reserve,
--               other) and a note of 1 to 200 characters, trimmed, or none.
--               Two live records of one person never share a day
--               (absences_no_overlap, 23P01): one day is never two kinds. A
--               removed one stays, with who and when (removed_at,
--               removed_by), and makes way.
--   who reads   the table is read as the hours are (20261115001100_roles_clock.sql):
--               the person while a member, whoever edits the clock (members
--               and views alike) and pay holders, with the time clock on. The
--               kind and the note go no further.
--   the team    those who build the schedule (schedule.edit) or edit the
--               clock read who is away and from when to when, and nothing
--               else (public.team_away, modelled on public.team_youth): the
--               builder, Today and the team's hours need that much, never the
--               kind or the note.
--   recording   public.record_absence(actor, business, person, kind, first,
--               last, note, at_time), with the secret key, for `actor`:
--               someone who edits the clock (private.can_edit_clock, 42501,
--               the clock's own words), never for themselves but an owner
--               (42501, hint 'own', the rule of one's own hours), for someone
--               active on the staff now (55000, hint 'not_on_staff': never an
--               accountant, never someone who left), from a year back to a
--               year ahead of the business's day at `at_time` (22023 with a
--               hint for each: 'kind', 'dates', 'order', 'too_long',
--               'too_far', 'note'), and never in a month closed for payroll
--               (55000, hint 'month_closed', the first such month in the
--               detail, `YYYY-MM`) until it is reopened. Returns its id.
--   changing    public.change_absence(actor, absence, kind, first, last,
--               note, at_time): the same rules; a closed month only for the
--               days whose state changes: every day of the old and the new
--               when the kind changes, else only the days added or dropped,
--               and none for a note alone (it never reaches payroll). So
--               reserve duty that began in a closed month still ends sooner,
--               runs on, or takes a note. A removed one is refused (55000,
--               hint 'removed'); nothing different writes nothing.
--               changed_at and changed_by keep the last change.
--   removing    public.remove_absence(actor, absence, at_time): the same
--               access and own rule; every one of its days changes, so none
--               may be in a closed month. One removed already is refused
--               (55000, hint 'removed'). Someone who left can still have a
--               wrong record taken off.
--   undoing     public.restore_absence(actor, absence, at_time): only by
--               whoever removed it, within ten minutes (55000, hint
--               'too_late', as a removed break, 20261117000300_break_edits.sql;
--               after that it is recorded again), for someone on the staff,
--               outside a closed month, and only while no live record took
--               its days (23P01). One not removed is refused (55000, hint
--               'not_removed'). It stamps changed_at.
--   not said    changing, removing and bringing back answer an unknown
--               record exactly as one of a business the actor doesn't edit
--               (42501, "Managers and owners only"): whether a record exists
--               is never told before access is.
--   the log     clock.absence_add {absence, person, kind, from, to, noted},
--               clock.absence_change {absence, person, from: {kind, from, to},
--               to: {kind, from, to}, note_changed}, clock.absence_remove and
--               clock.absence_restore {absence, person, kind, from, to}. The
--               note itself is never logged (it may be about someone's
--               health): only whether there is one, or whether it changed.
--               The clock's family, so private.log_perm reads them at
--               clock.edit, and pay holders read them too; no trigger on the
--               log takes these actions, so nobody gets a line. The pay
--               screen reads them to tell whether the days away of a month's
--               whole weeks (what the hours engine reads for it) changed
--               since its file: each record before and after, so a record
--               moved out of the month counts, and a note alone doesn't.
--   kept        records, as hours are (20261110000100_hours_kept.sql):
--               `restrict` keys to the membership, and nothing deletes a row
--               but the demo reset's purge, which now takes them before the
--               memberships go.
--   locks       after the access checks: the business (`for key share`,
--               which waits on any `for update` of it: the demo reset's, a
--               save of its details, a template applied; none of those locks
--               a membership first), then the person's membership (`for
--               share`), then the record (`for update`); a new record locks
--               no record. So a demo reset under way finishes before a write
--               takes anything, and a reset that comes after waits for the
--               write: the two never hold what the other waits on. A
--               business a reset replaced while the write waited is refused
--               before the new one's membership is locked: a new record as an
--               unknown business (P0002, the phone sends again, asked
--               afresh), a change, removal or return as an unknown record
--               (42501), the reset having taken it. No other function locks a
--               record, and closing a month locks none: a record written at
--               the very moment a month closes may miss its snapshot, the
--               same window an hours correction has.
--   demo        no day away is seeded; a visitor may record one, and the
--               reset takes it.

------------------------------------------------------------------------------
-- 1. The table

create table public.absences (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  user_id uuid not null,
  kind text not null check (kind in ('vacation', 'sick', 'reserve', 'other')),
  from_day date not null,
  to_day date not null,
  note text check (char_length(note) between 1 and 200 and note = btrim(note)),
  recorded_by uuid references public.profiles (id) on delete set null,
  recorded_at timestamptz not null default now(),
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz,
  removed_by uuid references public.profiles (id) on delete set null,
  removed_at timestamptz,
  constraint absences_days check (to_day >= from_day and to_day - from_day < 366),
  -- A changer or remover always has a time; the time stays if they are deleted.
  constraint absences_changed_by check (changed_by is null or changed_at is not null),
  constraint absences_removed_by check (removed_by is null or removed_at is not null),
  -- A record, as hours are: someone who leaves is made inactive, never
  -- deleted, and a person or business with one stays (23503).
  foreign key (business_id, user_id)
    references public.memberships (business_id, user_id) on delete restrict,
  -- One person is away once on a day: live records never share one. A
  -- removed one makes way (btree_gist is on: time_entries_no_overlap uses it).
  constraint absences_no_overlap exclude using gist (
    business_id with =,
    user_id with =,
    daterange(from_day, to_day, '[]') with &&
  ) where (removed_at is null)
);

create index absences_person_idx on public.absences (business_id, user_id, from_day);
create index absences_days_idx on public.absences (business_id, from_day, to_day)
  where removed_at is null;
create index absences_recorded_by_idx on public.absences (recorded_by);
create index absences_changed_by_idx on public.absences (changed_by);
create index absences_removed_by_idx on public.absences (removed_by);

alter table public.absences enable row level security;
revoke all on public.absences from anon, authenticated;
-- Written only through the four functions below; a truncate would skip the
-- trigger that keeps them.
revoke insert, update, delete, truncate on public.absences from service_role;
grant select on public.absences to authenticated;

-- The hours' own (20261115001100_roles_clock.sql), on this table.
create policy "people read their own absences, the clock's editors and pay holders all"
  on public.absences for select to authenticated
  using (
    private.module_enabled(business_id, 'time_clock')
    and (
      (user_id = (select auth.uid()) and private.is_member(business_id))
      or business_id in (select private.businesses_holding('clock.edit'))
      or private.has_perm(business_id, 'clock.payroll')
      or private.viewing_payroll(business_id)
    )
  );

comment on table public.absences is
  'Days a person on the staff is away: vacation, sick leave, reserve duty or another absence, whole days from one to another. Read like hours: the person, whoever edits the clock and pay holders; the team that builds the schedule reads only who and when (public.team_away). Written only by public.record_absence, change_absence, remove_absence and restore_absence; deleted only by a demo reset (private.purge_business_records).';
comment on column public.absences.business_id is
  'The business the person is away from.';
comment on column public.absences.user_id is
  'Who is away: someone on the staff when it was recorded.';
comment on column public.absences.kind is
  'vacation, sick (sick leave), reserve (reserve duty) or other. The app counts days by kind and never what they come to in pay.';
comment on column public.absences.from_day is
  'The first day away, by the business''s calendar.';
comment on column public.absences.to_day is
  'The last day away, included; at most 365 days after from_day.';
comment on column public.absences.note is
  'What the recorder wrote, 1 to 200 characters, trimmed, or null. Never in the log; the screen asks for no medical details.';
comment on column public.absences.recorded_by is
  'Who recorded it; null once their profile goes, while recorded_at stays.';
comment on column public.absences.recorded_at is
  'When it was recorded.';
comment on column public.absences.changed_by is
  'Who changed it or brought it back last; null once their profile goes.';
comment on column public.absences.changed_at is
  'When it was last changed (its note too) or brought back. Null when never. Whether a payroll file is out of date is read from the log (clock.absence_*), which keeps the days before and after.';
comment on column public.absences.removed_by is
  'Who removed it; null once their profile goes, while removed_at stays.';
comment on column public.absences.removed_at is
  'When it was removed: it stays, and counts nowhere. Null for a live one.';

------------------------------------------------------------------------------
-- 2. Nothing deletes them

create function private.refuse_absence_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.deleting_allowed(old.business_id, null::uuid) then
    raise exception 'Days away are kept: nothing deletes them' using errcode = '42501';
  end if;
  return old;
end;
$$;

create trigger absences_kept before delete on public.absences
  for each row execute function private.refuse_absence_delete();

------------------------------------------------------------------------------
-- 3. What a record must be

-- Raise unless the values make a record for the business at `at_time`: one
-- of the four kinds, both days, the last on or after the first, at most 366
-- days, from a year back to a year ahead of the business's day, and a note
-- of at most 200 characters. Returns the note as it is kept: trimmed, or
-- null when empty. @domain/absences (parseAbsence) holds the same edges.
create function private.absence_note_of(
  business uuid,
  absence_kind text,
  first_day date,
  last_day date,
  absence_note text,
  at_time timestamptz
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tz text;
  today date;
  kept text := nullif(btrim(absence_note), '');
begin
  if absence_kind is null
    or absence_kind not in ('vacation'::text, 'sick'::text, 'reserve'::text, 'other'::text)
  then
    raise exception 'Unknown kind of absence' using errcode = '22023', hint = 'kind';
  end if;
  if first_day is null or last_day is null then
    raise exception 'An absence needs its first and last day'
      using errcode = '22023', hint = 'dates';
  end if;
  if last_day < first_day then
    raise exception 'An absence ends on or after its first day'
      using errcode = '22023', hint = 'order';
  end if;
  if last_day - first_day >= 366 then
    raise exception 'At most 366 days at a time' using errcode = '22023', hint = 'too_long';
  end if;

  select b.timezone into tz from public.businesses b where b.id = business;
  today := (at_time at time zone tz)::date;
  if first_day < today - 366 or last_day > today + 366 then
    raise exception 'From a year back to a year ahead' using errcode = '22023', hint = 'too_far';
  end if;

  if char_length(kept) > 200 then
    raise exception 'The note is too long' using errcode = '22023', hint = 'note';
  end if;
  return kept;
end;
$$;

-- The first month from `first_day` to `last_day` closed for payroll and not
-- reopened, as `YYYY-MM`, or null.
create function private.absence_closed_month(business uuid, first_day date, last_day date)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select to_char(g.m, 'YYYY-MM')
  from generate_series(
    date_trunc('month', absence_closed_month.first_day::timestamp),
    absence_closed_month.last_day::timestamp,
    interval '1 month'
  ) as g (m)
  where private.month_closed(absence_closed_month.business, g.m::date)
  order by g.m
  limit 1
$$;

------------------------------------------------------------------------------
-- 4. Recording, changing, removing and bringing back

-- Someone who edits the clock records that a person on the staff is away.
-- Returns the record's id. Over a live record of the same person, the
-- no-overlap constraint refuses it (23P01).
create function public.record_absence(
  actor uuid,
  business uuid,
  person uuid,
  absence_kind text,
  first_day date,
  last_day date,
  absence_note text default null,
  at_time timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  member public.memberships%rowtype;
  kept text;
  closed_text text;
  made uuid;
begin
  if not private.can_edit_clock(business, actor) then
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;

  perform private.check_time_clock_on(business);

  if person = actor and not private.is_active_owner(business, actor) then
    raise exception 'Only an owner records your own days away'
      using errcode = '42501', hint = 'own';
  end if;

  -- The business first, then the person: a demo reset under way finishes
  -- before this takes anything.
  perform 1 from public.businesses b where b.id = business for key share;
  if not found then
    -- Gone since it was read (a demo's reset deletes it and writes it
    -- again): refused before the new one's people are locked, and the
    -- phone sends again, asked afresh.
    raise exception 'Unknown business' using errcode = 'P0002';
  end if;

  -- The person stays on the staff while this records (a removal waits).
  select * into member
  from public.memberships m
  where m.business_id = business and m.user_id = person
  for share;
  if not found or not member.active or not private.is_staff_role(member.role) then
    raise exception 'The person is not on the staff' using errcode = '55000', hint = 'not_on_staff';
  end if;

  kept := private.absence_note_of(
    business, absence_kind, first_day, last_day, absence_note, at_time);

  closed_text := private.absence_closed_month(business, first_day, last_day);
  if closed_text is not null then
    raise exception 'The month is closed for payroll'
      using errcode = '55000', hint = 'month_closed', detail = closed_text;
  end if;

  insert into public.absences
    (business_id, user_id, kind, from_day, to_day, note, recorded_by, recorded_at)
  values (business, person, absence_kind, first_day, last_day, kept, actor, at_time)
  returning id into made;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, actor, 'clock.absence_add',
    jsonb_build_object('absence', made, 'person', person, 'kind', absence_kind,
      'from', first_day, 'to', last_day, 'noted', kept is not null)
  );
  return made;
end;
$$;

-- Someone who edits the clock changes a record's kind, days or note. Nothing
-- different writes nothing.
create function public.change_absence(
  actor uuid,
  absence uuid,
  absence_kind text,
  first_day date,
  last_day date,
  absence_note text default null,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  place uuid;
  person uuid;
  member public.memberships%rowtype;
  a public.absences%rowtype;
  kept text;
  closed_text text;
begin
  -- Access first, without a lock: an unknown record reads as one of a
  -- business the actor doesn't edit.
  select ab.business_id, ab.user_id into place, person
  from public.absences ab where ab.id = absence;
  if not found or not private.can_edit_clock(place, actor) then
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;

  perform private.check_time_clock_on(place);

  if person = actor and not private.is_active_owner(place, actor) then
    raise exception 'Only an owner records your own days away'
      using errcode = '42501', hint = 'own';
  end if;

  -- The business, the person, then the record (the header's locks).
  perform 1 from public.businesses b where b.id = place for key share;
  if not found then
    -- A demo reset replaced the business while this waited, and took the
    -- record with it: unknown, as above, before the new one's people are
    -- locked.
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;
  select * into member
  from public.memberships m
  where m.business_id = place and m.user_id = person
  for share;
  select * into a from public.absences ab where ab.id = absence for update;
  if not found then
    -- A demo reset took it while this waited: unknown, as above.
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;

  if a.removed_at is not null then
    raise exception 'The absence is removed' using errcode = '55000', hint = 'removed';
  end if;

  if not member.active or not private.is_staff_role(member.role) then
    raise exception 'The person is not on the staff' using errcode = '55000', hint = 'not_on_staff';
  end if;

  kept := private.absence_note_of(
    place, absence_kind, first_day, last_day, absence_note, at_time);

  if (a.kind, a.from_day, a.to_day, a.note)
    is not distinct from (absence_kind, first_day, last_day, kept)
  then
    return;
  end if;

  -- Only the days whose state changes meet a closed month: every day of
  -- both when the kind changes or the days don't meet, else the days added
  -- or dropped at each end. A note alone changes none. The first such
  -- month is named (`YYYY-MM` sorts as the calendar does).
  if a.kind is distinct from absence_kind
    or first_day > a.to_day
    or last_day < a.from_day
  then
    closed_text := least(
      private.absence_closed_month(place, a.from_day, a.to_day),
      private.absence_closed_month(place, first_day, last_day));
  else
    closed_text := least(
      case when first_day <> a.from_day then
        private.absence_closed_month(place,
          least(first_day, a.from_day), greatest(first_day, a.from_day) - 1)
      end,
      case when last_day <> a.to_day then
        private.absence_closed_month(place,
          least(last_day, a.to_day) + 1, greatest(last_day, a.to_day))
      end);
  end if;
  if closed_text is not null then
    raise exception 'The month is closed for payroll'
      using errcode = '55000', hint = 'month_closed', detail = closed_text;
  end if;

  update public.absences
  set kind = absence_kind,
    from_day = first_day,
    to_day = last_day,
    note = kept,
    changed_by = actor,
    changed_at = at_time
  where id = absence;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    place, actor, 'clock.absence_change',
    jsonb_build_object('absence', absence, 'person', person,
      'from', jsonb_build_object('kind', a.kind, 'from', a.from_day, 'to', a.to_day),
      'to', jsonb_build_object('kind', absence_kind, 'from', first_day, 'to', last_day),
      'note_changed', a.note is distinct from kept)
  );
end;
$$;

-- Someone who edits the clock removes a record entered by mistake. It stays,
-- with who and when, and counts nowhere.
create function public.remove_absence(
  actor uuid,
  absence uuid,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  place uuid;
  person uuid;
  a public.absences%rowtype;
  closed_text text;
begin
  select ab.business_id, ab.user_id into place, person
  from public.absences ab where ab.id = absence;
  if not found or not private.can_edit_clock(place, actor) then
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;

  perform private.check_time_clock_on(place);

  if person = actor and not private.is_active_owner(place, actor) then
    raise exception 'Only an owner records your own days away'
      using errcode = '42501', hint = 'own';
  end if;

  -- The business, the person, then the record (the header's locks).
  perform 1 from public.businesses b where b.id = place for key share;
  if not found then
    -- A demo reset replaced the business while this waited, and took the
    -- record with it: unknown, as above, before the new one's people are
    -- locked.
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;
  perform 1
  from public.memberships m
  where m.business_id = place and m.user_id = person
  for share;
  select * into a from public.absences ab where ab.id = absence for update;
  if not found then
    -- A demo reset took it while this waited: unknown, as above.
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;

  if a.removed_at is not null then
    raise exception 'The absence is removed' using errcode = '55000', hint = 'removed';
  end if;

  closed_text := private.absence_closed_month(place, a.from_day, a.to_day);
  if closed_text is not null then
    raise exception 'The month is closed for payroll'
      using errcode = '55000', hint = 'month_closed', detail = closed_text;
  end if;

  update public.absences
  set removed_at = at_time, removed_by = actor
  where id = absence;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    place, actor, 'clock.absence_remove',
    jsonb_build_object('absence', absence, 'person', person, 'kind', a.kind,
      'from', a.from_day, 'to', a.to_day)
  );
end;
$$;

-- Whoever removed a record takes the removal back, within ten minutes (a
-- removed break's window; after that, it is recorded again). It comes back
-- as it was, or not at all: a live record may have taken its days (the
-- constraint, 23P01).
create function public.restore_absence(
  actor uuid,
  absence uuid,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  place uuid;
  person uuid;
  member public.memberships%rowtype;
  a public.absences%rowtype;
  closed_text text;
begin
  select ab.business_id, ab.user_id into place, person
  from public.absences ab where ab.id = absence;
  if not found or not private.can_edit_clock(place, actor) then
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;

  perform private.check_time_clock_on(place);

  if person = actor and not private.is_active_owner(place, actor) then
    raise exception 'Only an owner records your own days away'
      using errcode = '42501', hint = 'own';
  end if;

  -- The business, the person, then the record (the header's locks).
  perform 1 from public.businesses b where b.id = place for key share;
  if not found then
    -- A demo reset replaced the business while this waited, and took the
    -- record with it: unknown, as above, before the new one's people are
    -- locked.
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;
  select * into member
  from public.memberships m
  where m.business_id = place and m.user_id = person
  for share;
  select * into a from public.absences ab where ab.id = absence for update;
  if not found then
    -- A demo reset took it while this waited: unknown, as above.
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;

  if a.removed_at is null then
    raise exception 'The absence is not removed' using errcode = '55000', hint = 'not_removed';
  end if;

  if a.removed_by is distinct from actor or at_time - a.removed_at > interval '10 minutes' then
    raise exception 'Too late to bring it back' using errcode = '55000', hint = 'too_late';
  end if;

  if not member.active or not private.is_staff_role(member.role) then
    raise exception 'The person is not on the staff' using errcode = '55000', hint = 'not_on_staff';
  end if;

  closed_text := private.absence_closed_month(place, a.from_day, a.to_day);
  if closed_text is not null then
    raise exception 'The month is closed for payroll'
      using errcode = '55000', hint = 'month_closed', detail = closed_text;
  end if;

  update public.absences
  set removed_at = null, removed_by = null, changed_by = actor, changed_at = at_time
  where id = absence;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    place, actor, 'clock.absence_restore',
    jsonb_build_object('absence', absence, 'person', person, 'kind', a.kind,
      'from', a.from_day, 'to', a.to_day)
  );
end;
$$;

------------------------------------------------------------------------------
-- 5. Who is away, for the schedule

-- Those who build the schedule (schedule.edit) or edit the clock, members and
-- views alike (private.businesses_holding, asked once), read who on the staff
-- is away and from when to when, over at most 62 days asked (two months'
-- weeks; more gives nothing). Never the kind or the note. No caller in the
-- database; the builder, Today and the team's hours call it (getTeamAway in
-- @db/absences).
create function public.team_away(business uuid, first_day date, last_day date)
returns table (user_id uuid, from_day date, to_day date)
language sql
stable
security definer
set search_path = ''
as $$
  select ab.user_id, ab.from_day, ab.to_day
  from public.absences ab
  join public.memberships m
    on m.business_id = ab.business_id and m.user_id = ab.user_id and m.active
  where ab.business_id = team_away.business
    and ab.removed_at is null
    and ab.from_day <= team_away.last_day
    and ab.to_day >= team_away.first_day
    and team_away.last_day - team_away.first_day between 0 and 62
    and private.is_staff_role(m.role)
    and private.module_enabled(team_away.business, 'time_clock'::public.module_key)
    and (
      team_away.business in (select private.businesses_holding('schedule.edit'::text))
      or team_away.business in (select private.businesses_holding('clock.edit'::text))
    )
  order by ab.from_day, ab.user_id
$$;

------------------------------------------------------------------------------
-- 6. The demo reset

-- The demo reset's purge: 20261126000200_employee_files.sql's, with the days
-- away after the hours, before the memberships go (their key is `restrict`).
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
  delete from public.absences ab where ab.business_id = business;
  delete from public.member_wages w where w.business_id = business;
  delete from public.member_payroll_details d where d.business_id = business;
  delete from public.employment_periods p where p.business_id = business;
  delete from public.payroll_months pm where pm.business_id = business;
  delete from public.document_recipients r where r.business_id = business;
  delete from public.documents doc where doc.business_id = business;
  delete from public.employee_tax_years ty where ty.business_id = business;
  delete from public.member_emergency_contacts ec where ec.business_id = business;
  delete from public.employee_details ed where ed.business_id = business;
  delete from private.file_acknowledgements fa where fa.business_id = business;
  delete from private.person_keys pk where pk.business_id = business;
  delete from public.audit_log a where a.business_id = business;
  perform set_config('ca.records_purge', coalesce(prior, ''), true);
end;
$$;

------------------------------------------------------------------------------
-- 7. Who may call what

revoke execute on function private.refuse_absence_delete()
  from public, anon, authenticated;
revoke execute on function private.absence_note_of(uuid, text, date, date, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function private.absence_closed_month(uuid, date, date)
  from public, anon, authenticated;
revoke execute on function public.record_absence(uuid, uuid, uuid, text, date, date, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_absence(uuid, uuid, uuid, text, date, date, text, timestamptz)
  to service_role;
revoke execute on function public.change_absence(uuid, uuid, text, date, date, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.change_absence(uuid, uuid, text, date, date, text, timestamptz)
  to service_role;
revoke execute on function public.remove_absence(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.remove_absence(uuid, uuid, timestamptz) to service_role;
revoke execute on function public.restore_absence(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.restore_absence(uuid, uuid, timestamptz) to service_role;
revoke execute on function public.team_away(uuid, date, date) from public, anon;
grant execute on function public.team_away(uuid, date, date) to authenticated;
revoke execute on function private.purge_business_records(uuid)
  from public, anon, authenticated, service_role;
