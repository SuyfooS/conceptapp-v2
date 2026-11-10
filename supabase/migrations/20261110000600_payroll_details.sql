-- Details for payroll (payroll P5; Orel, 8 and 9 November 2026, issue #1),
-- reconciled with the hiring file's design (profile design §2.10): payroll
-- keeps only what pay is worked out from. No ID number, no address, no bank
-- account and no birth date: those wait for the hiring file (H4), and real ID
-- and bank numbers aren't collected at all yet.
--
--   details   public.member_payroll_details: a person's number in the payroll
--             system, their weekly rest day (Saturday unless they asked for
--             Friday or Sunday, Hours of Work and Rest Law s.7(ב): a day, never
--             a religion), whether the Hours law applies to them (s.30(א)(5)
--             and (6)), the day a minor turns 18 (`youth_until`; null for an
--             adult) and whether a minor is at school (the 20:00 limit, Youth
--             Labor Law s.24(ב)(1)). Read like wages: the person while a
--             member, pay holders and a view as an accountant.
--   birth     public.set_payroll_details accepts a birth date once, from an
--             owner or the accountant, and keeps only youth_until: the 18th
--             birthday (29 February + 18 years is 28 February, as Postgres
--             adds years). The date itself is never stored, and the log names
--             the field, never a value. When H4 lands, set_employee_details
--             writes youth_until, and H4's migration takes birth_date out of
--             set_payroll_details.
--   periods   public.employment_periods: from when to when someone worked
--             here, and their last payment, never overlapping, so a rehire is
--             a second period instead of overwriting the first. Backfilled
--             from memberships ('joined', for a holder to check), and kept in
--             step with joining, leaving and coming back by a trigger on
--             memberships; a holder's own ('set') is never moved by it.
--   wages     public.set_hourly_wage now refuses a wage from before the person
--             started, once a holder has said when that was, and its log row
--             keeps the minimum of the person's age band on the wage's first
--             day (private.minimum_wage_for), the bands P4 left for this step.
--   youth     managers without pay access still see who is a minor, and until
--             when (public.team_youth): the schedule needs it. Never the
--             details, never a birth date.
--   kept      both are records, as hours and wages are (20261110000100_hours_kept.sql):
--             `restrict` keys to the membership, and nothing deletes a row but
--             the demo reset's purge.
--   demo      payroll numbers from 101, the shop's Liya a minor (17 through
--             the seeded month) without a number yet, Roni resting on Friday,
--             and periods from 1 March 2026 (Itai from the 10th of three
--             months ago, set by the owner), put back by every reset through
--             private.seed_demo_pay.

------------------------------------------------------------------------------
-- 1. The details

create table public.member_payroll_details (
  business_id uuid not null,
  user_id uuid not null,
  -- The person's number in the business's payroll system.
  payroll_number text check (payroll_number ~ '^[0-9A-Za-z-]{1,20}$'),
  -- The weekly rest: Saturday (6) unless they asked for Friday (5) or Sunday
  -- (0), s.7(ב). A day, never a religion; the log never holds its value.
  rest_day smallint not null default 6 check (rest_day in (0, 5, 6)),
  -- 'trust': management or a position of personal trust (s.30(א)(5)), which
  -- courts give only to the most senior posts; 'unsupervised': hours that
  -- can't be supervised (s.30(א)(6)), which the payslip must say. With
  -- either, the law doesn't apply at all, rest-day pay included.
  hours_law text not null default 'applies'
    check (hours_law in ('applies', 'trust', 'unsupervised')),
  -- A minor's 18th birthday; null for an adult. Never the birth date.
  youth_until date,
  -- A minor subject to the Compulsory Education Law: the 20:00 night limit.
  compulsory_education boolean not null default true,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (business_id, user_id),
  -- A record, as hours are: someone who leaves is made inactive, never
  -- deleted, and a person or business with details stays (23503).
  foreign key (business_id, user_id)
    references public.memberships (business_id, user_id) on delete restrict
);

create unique index member_payroll_details_number_idx
  on public.member_payroll_details (business_id, payroll_number)
  where payroll_number is not null;
create index member_payroll_details_updated_by_idx
  on public.member_payroll_details (updated_by);

alter table public.member_payroll_details enable row level security;
revoke all on public.member_payroll_details from anon, authenticated;
-- Written only through public.set_payroll_details (and the demo's seed); a
-- truncate would skip the trigger below.
revoke insert, update, delete, truncate on public.member_payroll_details from service_role;
grant select on public.member_payroll_details to authenticated;

create policy "people read their own payroll details, pay holders the business's"
  on public.member_payroll_details for select to authenticated
  using (
    private.module_enabled(business_id, 'time_clock')
    and (
      (user_id = (select auth.uid()) and private.is_member(business_id))
      or private.has_perm(business_id, 'clock.payroll')
      or private.viewing_payroll(business_id)
    )
  );

comment on table public.member_payroll_details is
  'What payroll needs of a person beyond hours and wages: their payroll number, rest day, whether the Hours law applies, a minor''s 18th birthday (never the birth date) and school. Read by the person and pay holders (clock.payroll); written only by public.set_payroll_details; deleted only by a demo reset (private.purge_business_records).';

------------------------------------------------------------------------------
-- 2. Employment periods

create table public.employment_periods (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  user_id uuid not null,
  started_on date not null,
  -- Null while it goes on.
  ended_on date,
  -- The day of their last payment, once they left: retention counts from it.
  last_paid_on date,
  -- 'joined': copied from when the membership began (or came back), for a
  -- holder to check; 'set': a pay holder said so.
  source text not null default 'set' check (source in ('set', 'joined')),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  check (ended_on is null or ended_on >= started_on),
  check (last_paid_on is null or (ended_on is not null and last_paid_on >= started_on)),
  foreign key (business_id, user_id)
    references public.memberships (business_id, user_id) on delete restrict,
  constraint employment_periods_no_overlap exclude using gist (
    business_id with =,
    user_id with =,
    daterange(started_on, ended_on, '[]') with &&
  )
);

create index employment_periods_person_idx
  on public.employment_periods (business_id, user_id, started_on);
create index employment_periods_updated_by_idx
  on public.employment_periods (updated_by);

alter table public.employment_periods enable row level security;
revoke all on public.employment_periods from anon, authenticated;
-- Written only through public.set_employment_period, the trigger on
-- memberships below and the demo's seed.
revoke insert, update, delete, truncate on public.employment_periods from service_role;
grant select on public.employment_periods to authenticated;

create policy "people read their own periods, pay holders the business's"
  on public.employment_periods for select to authenticated
  using (
    private.module_enabled(business_id, 'time_clock')
    and (
      (user_id = (select auth.uid()) and private.is_member(business_id))
      or private.has_perm(business_id, 'clock.payroll')
      or private.viewing_payroll(business_id)
    )
  );

comment on table public.employment_periods is
  'When each person worked in the business, and their last payment, never overlapping: a rehire is a new period. ''joined'' ones are copied from the membership, for a holder to check; ''set'' ones a pay holder entered. Written by public.set_employment_period and the memberships trigger; deleted only by a demo reset.';

------------------------------------------------------------------------------
-- 3. Kept

-- Nothing deletes a person's details or periods but a purge that names the
-- business (private.deleting_allowed, every comparison wrapped, so a fresh
-- session fails closed). Changes go through the functions below.
create function private.refuse_payroll_record_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.deleting_allowed(old.business_id, null::uuid) then
    raise exception 'Payroll records are kept: nothing deletes them' using errcode = '42501';
  end if;
  return old;
end;
$$;

create trigger member_payroll_details_kept before delete on public.member_payroll_details
  for each row execute function private.refuse_payroll_record_delete();
create trigger employment_periods_kept before delete on public.employment_periods
  for each row execute function private.refuse_payroll_record_delete();

------------------------------------------------------------------------------
-- 4. Periods from memberships

-- One 'joined' period for each membership on the staff that has none yet,
-- from the business's day it began; one that is no longer active ends on the
-- day it last changed. Run once below; safe to run again.
create function private.backfill_employment_periods()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  added integer;
begin
  insert into public.employment_periods (business_id, user_id, started_on, ended_on, source)
  select m.business_id, m.user_id,
    (m.created_at at time zone b.timezone)::date,
    case when not m.active then
      greatest(
        (m.updated_at at time zone b.timezone)::date,
        (m.created_at at time zone b.timezone)::date
      )
    end,
    'joined'
  from public.memberships m
  join public.businesses b on b.id = m.business_id
  where private.is_staff_role(m.role)
    and not exists (
      select 1 from public.employment_periods p
      where p.business_id = m.business_id and p.user_id = m.user_id
    );
  get diagnostics added = row_count;
  return added;
end;
$$;

select private.backfill_employment_periods();

-- Nothing else would write a period: claim_invite, the console and the demo
-- reset make memberships. So when a membership on the staff starts or comes
-- back (active, and not an accountant), a 'joined' period opens on the
-- business's day; when it stops (inactive, or an accountant now), the open
-- 'joined' one closes on that day. Back on the day it closed: the same period
-- goes on. A holder's own ('set') period is never moved: theirs stands, and
-- a membership write never fails over a period.
create function private.track_employment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text;
  local_day date;
  comes_in boolean;
  goes_out boolean;
begin
  if tg_op = 'INSERT' then
    comes_in := new.active and private.is_staff_role(new.role);
    goes_out := false;
  else
    comes_in := new.active and private.is_staff_role(new.role)
      and not (old.active and private.is_staff_role(old.role));
    goes_out := old.active and private.is_staff_role(old.role)
      and not (new.active and private.is_staff_role(new.role));
  end if;
  if not (comes_in or goes_out) then
    return null;
  end if;

  select b.timezone into tz from public.businesses b where b.id = new.business_id;
  local_day := (
    (case when tg_op = 'INSERT' then new.created_at else now() end)
      at time zone coalesce(tz, 'Asia/Jerusalem')
  )::date;

  begin
    if goes_out then
      update public.employment_periods p
      set ended_on = greatest(p.started_on, local_day), updated_at = now()
      where p.business_id = new.business_id
        and p.user_id = new.user_id
        and p.source = 'joined'
        and p.ended_on is null;
    elsif exists (
      select 1 from public.employment_periods p
      where p.business_id = new.business_id
        and p.user_id = new.user_id
        and coalesce(p.ended_on, 'infinity'::date) >= local_day
    ) then
      -- Back on the day the app closed it: the same period goes on. A
      -- holder's period that covers the day already says so.
      update public.employment_periods p
      set ended_on = null, last_paid_on = null, updated_at = now()
      where p.business_id = new.business_id
        and p.user_id = new.user_id
        and p.source = 'joined'
        and p.ended_on = local_day;
    else
      insert into public.employment_periods (business_id, user_id, started_on, source)
      values (new.business_id, new.user_id, local_day, 'joined');
    end if;
  exception when exclusion_violation or check_violation then
    -- A holder's periods already say otherwise: theirs stand.
    null;
  end;
  return null;
end;
$$;

create trigger memberships_track_employment
  after insert or update of active, role on public.memberships
  for each row execute function private.track_employment();

------------------------------------------------------------------------------
-- 5. Setting the details

-- Set some of a person's payroll details, for `actor`, with the secret key.
-- `patch` holds only the keys to change: payroll_number (text, or null to
-- clear), rest_day (0, 5 or 6), hours_law ('applies', 'trust',
-- 'unsupervised'), compulsory_education (true or false), and birth_date
-- ('YYYY-MM-DD', or null for an adult): from an owner or the accountant only,
-- it is never stored, only youth_until worked out from it. A pay holder sets
-- them, never their own, an owner's only an owner, and never an accountant's,
-- who has no hours here. The person may have left. A call that changes
-- nothing writes no log row; the row says which fields changed, never a value.
create function public.set_payroll_details(
  actor uuid,
  business uuid,
  person uuid,
  patch jsonb,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  person_role public.member_role;
  set_on timestamptz := coalesce(at_time, now());
  local_today date;
  unknown_key text;
  new_number text;
  new_rest smallint;
  new_law text;
  new_school boolean;
  new_youth date;
  born date;
  was public.member_payroll_details%rowtype;
  became public.member_payroll_details%rowtype;
  changed text[] := '{}'::text[];
begin
  perform private.check_time_clock_on(business);

  if actor is null or not private.holds_perm(business, actor, 'clock.payroll') then
    raise exception 'Pay holders only' using errcode = '42501';
  end if;

  if person is not distinct from actor then
    raise exception 'Someone else sets your own details' using errcode = '42501';
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
    raise exception 'Only an owner sets an owner''s details' using errcode = '42501';
  end if;

  if jsonb_typeof(patch) is distinct from 'object' then
    raise exception 'The details are an object' using errcode = '22023';
  end if;

  select k into unknown_key
  from jsonb_object_keys(patch) as k
  where k not in (
    'payroll_number', 'rest_day', 'hours_law', 'compulsory_education', 'birth_date'
  )
  limit 1;
  if unknown_key is not null then
    raise exception 'Not a payroll detail: %', unknown_key using errcode = '22023';
  end if;

  if patch ? 'payroll_number' then
    if jsonb_typeof(patch -> 'payroll_number') = 'null' then
      new_number := null;
    elsif jsonb_typeof(patch -> 'payroll_number') = 'string' then
      new_number := nullif(btrim(patch ->> 'payroll_number'), '');
      if new_number is not null and new_number !~ '^[0-9A-Za-z-]{1,20}$' then
        raise exception 'A payroll number is 1 to 20 letters, digits or dashes'
          using errcode = '22023';
      end if;
    else
      raise exception 'A payroll number is text' using errcode = '22023';
    end if;
  end if;

  -- Its value is left to the table's check (23514).
  if patch ? 'rest_day' then
    if jsonb_typeof(patch -> 'rest_day') is distinct from 'number'
      or (patch ->> 'rest_day') !~ '^[0-9]{1,2}$'
    then
      raise exception 'A rest day is a weekday''s number' using errcode = '22023';
    end if;
    new_rest := (patch ->> 'rest_day')::smallint;
  end if;

  if patch ? 'hours_law' then
    if jsonb_typeof(patch -> 'hours_law') is distinct from 'string' then
      raise exception 'Say how the Hours law applies' using errcode = '22023';
    end if;
    new_law := patch ->> 'hours_law';
  end if;

  if patch ? 'compulsory_education' then
    if jsonb_typeof(patch -> 'compulsory_education') is distinct from 'boolean' then
      raise exception 'Say whether they are at school' using errcode = '22023';
    end if;
    new_school := (patch ->> 'compulsory_education')::boolean;
  end if;

  select (set_on at time zone b.timezone)::date into local_today
  from public.businesses b
  where b.id = business;

  -- The birth date: from the circle that will hold the hiring file (an owner,
  -- the accountant), read once, and only the 18th birthday kept.
  if patch ? 'birth_date' then
    if not (
      private.is_active_owner(business, actor)
      or exists (
        select 1 from public.memberships m
        where m.business_id = business and m.user_id = actor
          and m.active and m.role = 'accountant'
      )
    ) then
      raise exception 'Only an owner or the accountant enters a birth date'
        using errcode = '42501';
    end if;
    if jsonb_typeof(patch -> 'birth_date') = 'null' then
      new_youth := null;
    else
      if jsonb_typeof(patch -> 'birth_date') is distinct from 'string'
        or (patch ->> 'birth_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      then
        raise exception 'A birth date is a day, YYYY-MM-DD' using errcode = '22023';
      end if;
      begin
        born := (patch ->> 'birth_date')::date;
      exception when datetime_field_overflow or invalid_datetime_format then
        raise exception 'A birth date is a day, YYYY-MM-DD' using errcode = '22023';
      end;
      if born > local_today or born < (local_today - interval '100 years')::date then
        raise exception 'A birth date is in the last 100 years' using errcode = '22023';
      end if;
      new_youth := case
        when (born + interval '18 years')::date > local_today
          then (born + interval '18 years')::date
      end;
    end if;
  end if;

  -- The row, with the table's defaults when there is none yet.
  insert into public.member_payroll_details (business_id, user_id, updated_by, updated_at)
  values (business, person, actor, set_on)
  on conflict (business_id, user_id) do nothing;

  select * into was
  from public.member_payroll_details d
  where d.business_id = business and d.user_id = person
  for update;

  became := was;
  if patch ? 'payroll_number' then
    became.payroll_number := new_number;
  end if;
  if patch ? 'rest_day' then
    became.rest_day := new_rest;
  end if;
  if patch ? 'hours_law' then
    became.hours_law := new_law;
  end if;
  if patch ? 'compulsory_education' then
    became.compulsory_education := new_school;
  end if;
  if patch ? 'birth_date' then
    became.youth_until := new_youth;
  end if;

  if became.payroll_number is distinct from was.payroll_number then
    changed := array_append(changed, 'payroll_number');
  end if;
  if became.rest_day is distinct from was.rest_day then
    changed := array_append(changed, 'rest_day');
  end if;
  if became.hours_law is distinct from was.hours_law then
    changed := array_append(changed, 'hours_law');
  end if;
  if became.compulsory_education is distinct from was.compulsory_education then
    changed := array_append(changed, 'compulsory_education');
  end if;
  if became.youth_until is distinct from was.youth_until then
    changed := array_append(changed, 'youth_until');
  end if;

  if cardinality(changed) = 0 then
    return;
  end if;

  update public.member_payroll_details d
  set payroll_number = became.payroll_number,
    rest_day = became.rest_day,
    hours_law = became.hours_law,
    compulsory_education = became.compulsory_education,
    youth_until = became.youth_until,
    updated_by = actor,
    updated_at = set_on
  where d.business_id = business and d.user_id = person;

  -- Field names only: no number, no day, no rest day's value.
  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, actor, 'payroll.details',
    jsonb_build_object('person', person, 'fields', to_jsonb(changed))
  );
end;
$$;

------------------------------------------------------------------------------
-- 6. Setting a period

-- Add a period of a person's work, or change one of theirs (`period_id`), for
-- `actor`, with the secret key: from `from_day`, until `to_day` (null while it
-- goes on), with the last payment on `paid_until` once it ended. The names are
-- apart from the table's columns, which the update reads. By the same rules as
-- the details; never overlapping another (23P01). The period is a holder's
-- from then on ('set'). The log row names the fields that changed, never a
-- day.
create function public.set_employment_period(
  actor uuid,
  business uuid,
  person uuid,
  from_day date,
  to_day date default null,
  paid_until date default null,
  period_id uuid default null,
  at_time timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  person_role public.member_role;
  set_on timestamptz := coalesce(at_time, now());
  local_today date;
  was public.employment_periods%rowtype;
  changed text[] := '{}'::text[];
  kept_id uuid;
begin
  perform private.check_time_clock_on(business);

  if actor is null or not private.holds_perm(business, actor, 'clock.payroll') then
    raise exception 'Pay holders only' using errcode = '42501';
  end if;

  if person is not distinct from actor then
    raise exception 'Someone else sets your own period' using errcode = '42501';
  end if;

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
    raise exception 'Only an owner sets an owner''s period' using errcode = '42501';
  end if;

  select (set_on at time zone b.timezone)::date into local_today
  from public.businesses b
  where b.id = business;

  if from_day is null then
    raise exception 'A period starts on a day' using errcode = '22023';
  end if;

  if from_day < (local_today - interval '100 years')::date then
    raise exception 'A period starts in the last 100 years' using errcode = '22023';
  end if;

  if from_day > (local_today + interval '12 months')::date then
    raise exception 'A period starts at most a year ahead' using errcode = '22023';
  end if;

  if to_day is not null and to_day < from_day then
    raise exception 'A period ends on or after its start' using errcode = '22023';
  end if;

  if to_day is not null and to_day > (local_today + interval '12 months')::date then
    raise exception 'A period ends at most a year ahead' using errcode = '22023';
  end if;

  if paid_until is not null and (to_day is null or paid_until < from_day) then
    raise exception 'The last payment comes once the period ended' using errcode = '22023';
  end if;

  if period_id is not null then
    select * into was
    from public.employment_periods p
    where p.id = period_id and p.business_id = business and p.user_id = person
    for update;
    if not found then
      raise exception 'Unknown period' using errcode = 'P0002';
    end if;
  end if;

  if exists (
    select 1
    from public.employment_periods p
    where p.business_id = business
      and p.user_id = person
      and p.id is distinct from period_id
      and daterange(p.started_on, p.ended_on, '[]') && daterange(from_day, to_day, '[]')
  ) then
    raise exception 'Periods overlap' using errcode = '23P01';
  end if;

  if period_id is null then
    insert into public.employment_periods (
      business_id, user_id, started_on, ended_on, last_paid_on, source, updated_by, updated_at
    )
    values (business, person, from_day, to_day, paid_until, 'set', actor, set_on)
    returning id into kept_id;
    changed := array_append(changed, 'started_on');
    if to_day is not null then
      changed := array_append(changed, 'ended_on');
    end if;
    if paid_until is not null then
      changed := array_append(changed, 'last_paid_on');
    end if;
  else
    kept_id := period_id;
    if was.started_on is distinct from from_day then
      changed := array_append(changed, 'started_on');
    end if;
    if was.ended_on is distinct from to_day then
      changed := array_append(changed, 'ended_on');
    end if;
    if was.last_paid_on is distinct from paid_until then
      changed := array_append(changed, 'last_paid_on');
    end if;
    -- A holder's period saved as it was: nothing to write.
    if cardinality(changed) = 0 and was.source = 'set' then
      return kept_id;
    end if;
    update public.employment_periods p
    set started_on = from_day,
      ended_on = to_day,
      last_paid_on = paid_until,
      source = 'set',
      updated_by = actor,
      updated_at = set_on
    where p.id = period_id;
  end if;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, actor, 'payroll.period',
    jsonb_build_object(
      'person', person,
      'period', kept_id,
      'added', period_id is null,
      'confirmed', coalesce(was.source = 'joined', false),
      'fields', to_jsonb(changed)
    )
  );

  return kept_id;
end;
$$;

------------------------------------------------------------------------------
-- 7. Who is a minor, for managers

-- The active members on the staff who are minors today, and until when, for
-- the business's owners and managers (and the team viewing it as one), who
-- schedule them, while the time clock is on, as for every read of the
-- details. Pay holders read the details themselves; nobody reads a birth
-- date, which is never stored.
create function public.team_youth(business uuid)
returns table (user_id uuid, youth_until date)
language sql
stable
security definer
set search_path = ''
as $$
  select d.user_id, d.youth_until
  from public.member_payroll_details d
  join public.memberships m
    on m.business_id = d.business_id and m.user_id = d.user_id and m.active
  join public.businesses b on b.id = d.business_id
  where d.business_id = team_youth.business
    and d.youth_until > (now() at time zone b.timezone)::date
    and private.is_staff_role(m.role)
    and private.module_enabled(team_youth.business, 'time_clock')
    and (private.has_role(team_youth.business, 'manager')
      or private.is_viewing(team_youth.business, 'manager'))
$$;

------------------------------------------------------------------------------
-- 8. Wages, not before they started, and the minimum by age

-- The hourly minimum in effect on a day for a person of the business, in
-- agorot, by their age band on that day (as @domain/youth's ageBandOn):
-- under 16 before two years ahead of youth_until, 16 from then, 17 from a
-- year ahead of it, the adult figure from it, or for someone with no details
-- or no youth_until. Null before the table's first row. The bands that
-- 20261110000500_hourly_wages.sql's private.minimum_wage_on left for P5.
create function private.minimum_wage_for(business uuid, person uuid, on_day date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
      when d.youth_until is null or minimum_wage_for.on_day >= d.youth_until
        then w.hourly_agorot
      when minimum_wage_for.on_day >= (d.youth_until - interval '1 year')::date
        then w.age17_hourly_agorot
      when minimum_wage_for.on_day >= (d.youth_until - interval '2 years')::date
        then w.age16_hourly_agorot
      else w.under16_hourly_agorot
    end
  from public.minimum_wages w
  left join public.member_payroll_details d
    on d.business_id = minimum_wage_for.business
    and d.user_id = minimum_wage_for.person
  where w.effective_from <= minimum_wage_for.on_day
  order by w.effective_from desc
  limit 1
$$;

-- public.set_hourly_wage of 20261110000500_hourly_wages.sql, with two
-- changes. Once a holder has said when the person started (their first
-- period is 'set'), a wage from before that day is refused (22023). A start
-- copied from joining the app is for a holder to check, so it limits
-- nothing: a business that joins today still sets last month's wages. And
-- the log keeps the minimum for the person's age band on the day the wage
-- starts (private.minimum_wage_for), so a minor's legal wage isn't logged as
-- under the adult minimum.
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
-- 9. The demo reset's purge: 20261110000500_hourly_wages.sql's, with the
--    details and the periods before the log.

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
  -- P9 (payroll_months) replaces this function and deletes its own here.
  delete from public.audit_log a where a.business_id = business;
  perform set_config('ca.records_purge', coalesce(prior, ''), true);
end;
$$;

------------------------------------------------------------------------------
-- 10. The demo: its details and periods

-- A demo business's details and periods, as its definition's "details" says:
--   {"since": "2026-03-01", "numbers": 101,
--    "cases": [{"user_id": "…", "case": "youth"}, …]}
-- Every active manager and worker gets a payroll number from "numbers", in
-- the definition's order; the owner and an accountant none. Every open
-- period on the staff (the reset's memberships opened them today) starts on
-- "since", still 'joined', as if the business joined the app then. The cases,
-- each on the person it names:
--   youth        a minor until the first of the month six months from now:
--                17 through the seeded month, a minor for half a year more
--   no_number    no payroll number yet, for the screens that say so
--   rest_friday  rests on Friday
--   started      started on the 10th of three months ago, set by the owner
-- Set by the definition's first owner. Nobody's Hours law is marked: courts
-- give s.30(א)(5) only to the most senior posts, and a demo shift manager
-- marked so would teach the wrong thing. No log rows: the demo starts with
-- them. Whatever goes wrong here, the reset still stands.
create function private.seed_demo_details(business uuid, details_plan jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text;
  this_month date;
  started_day date;
  since_day date;
  first_number integer;
  plan_cases jsonb;
  setter uuid;
begin
  if jsonb_typeof(details_plan) is distinct from 'object' then
    return;
  end if;

  begin
    select b.timezone into tz from public.businesses b where b.id = business;
    if tz is null then
      return;
    end if;

    -- The first of this month, by the business's clock.
    this_month := date_trunc('month', now() at time zone tz)::date;
    started_day := (this_month - interval '3 months')::date + 9;
    since_day := case
      when jsonb_typeof(details_plan -> 'since') = 'string'
        then (details_plan ->> 'since')::date
    end;
    first_number := case
      when jsonb_typeof(details_plan -> 'numbers') = 'number'
        then (details_plan ->> 'numbers')::integer
    end;
    plan_cases := case
      when jsonb_typeof(details_plan -> 'cases') = 'array'
        then details_plan -> 'cases'
      else '[]'::jsonb
    end;

    select m.user_id into setter
    from private.demo_businesses d
    cross join lateral jsonb_array_elements(d.definition -> 'people')
      with ordinality as p (value, ordinality)
    join public.memberships m
      on m.business_id = business and m.user_id::text = p.value ->> 'user_id' and m.active
    where d.business_id = business and m.role = 'owner'
    order by p.ordinality
    limit 1;

    insert into public.member_payroll_details (
      business_id, user_id, payroll_number, rest_day, youth_until, updated_by, updated_at
    )
    select business, s.user_id,
      case
        when first_number is not null and not s.no_number
          then (first_number + s.place - 1)::text
      end,
      (case when s.rest_friday then 5 else 6 end)::smallint,
      case when s.youth then (this_month + interval '6 months')::date end,
      setter, now()
    from (
      select m.user_id,
        row_number() over (order by p.ordinality) as place,
        plan_cases @> jsonb_build_array(
          jsonb_build_object('user_id', m.user_id::text, 'case', 'no_number')) as no_number,
        plan_cases @> jsonb_build_array(
          jsonb_build_object('user_id', m.user_id::text, 'case', 'rest_friday')) as rest_friday,
        plan_cases @> jsonb_build_array(
          jsonb_build_object('user_id', m.user_id::text, 'case', 'youth')) as youth
      from private.demo_businesses d
      cross join lateral jsonb_array_elements(d.definition -> 'people')
        with ordinality as p (value, ordinality)
      join public.memberships m
        on m.business_id = business and m.user_id::text = p.value ->> 'user_id' and m.active
      where d.business_id = business and m.role in ('manager', 'worker')
    ) s;

    update public.employment_periods ep
    set started_on = case when s.started then started_day else since_day end,
      source = case when s.started then 'set' else 'joined' end,
      updated_by = case when s.started then setter end,
      updated_at = now()
    from (
      select m.user_id,
        plan_cases @> jsonb_build_array(
          jsonb_build_object('user_id', m.user_id::text, 'case', 'started')) as started
      from public.memberships m
      where m.business_id = business and m.active and private.is_staff_role(m.role)
    ) s
    where ep.business_id = business
      and ep.user_id = s.user_id
      and ep.ended_on is null
      and (s.started or since_day is not null);
  exception when others then
    raise warning 'The demo''s payroll details were not written: %', sqlerrm;
  end;
end;
$$;

-- What a demo business starts with on the pay side
-- (20261110000500_hourly_wages.sql's, now with its details): the role grants
-- its definition names (`rolePermissions`), last month's hours (`hours`), its
-- wages (`wages`), and its details and periods (`details`). P9 doesn't
-- replace this; nothing replaces the reset.
create or replace function private.seed_demo_pay(business uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  def jsonb;
begin
  select d.definition into def
  from private.demo_businesses d
  where d.business_id = business;
  if not found then
    return;
  end if;

  insert into public.role_permissions (business_id, role, perm)
  select business, g.role, g.perm
  from jsonb_to_recordset(
    case
      when jsonb_typeof(def -> 'rolePermissions') = 'array'
        then def -> 'rolePermissions'
      else '[]'::jsonb
    end
  ) as g (role public.member_role, perm text)
  on conflict do nothing;

  perform private.seed_demo_hours(business, def -> 'hours');
  perform private.seed_demo_wages(business, def -> 'wages');
  perform private.seed_demo_details(business, def -> 'details');
end;
$$;

-- The hosted demo businesses, by their fixed ids (supabase/hosted-demo.sql says
-- the same, for the workflow's "demo" step): payroll numbers from 101 and
-- periods from 1 March 2026 in both; in the shop, Liya a minor without a
-- number yet, Roni resting on Friday and Itai started on the 10th of three
-- months ago. Both start again with them. Locally the seed runs after the
-- migrations, with its own.
update private.demo_businesses d
set definition = d.definition || $json$
  {"details": {"since": "2026-03-01", "numbers": 101, "cases": [
    {"user_id": "10000000-0000-4000-a000-000000000111", "case": "youth"},
    {"user_id": "10000000-0000-4000-a000-000000000111", "case": "no_number"},
    {"user_id": "10000000-0000-4000-a000-000000000110", "case": "rest_friday"},
    {"user_id": "10000000-0000-4000-a000-000000000109", "case": "started"}
  ]}}
  $json$::jsonb
where d.business_id = '10000000-0000-4000-b000-000000000002';

update private.demo_businesses d
set definition = d.definition || $json$
  {"details": {"since": "2026-03-01", "numbers": 101, "cases": []}}
  $json$::jsonb
where d.business_id = '10000000-0000-4000-b000-000000000001';

select public.reset_demo_business(d.business_id)
from private.demo_businesses d
join public.businesses b on b.id = d.business_id
where d.business_id in (
  '10000000-0000-4000-b000-000000000001', '10000000-0000-4000-b000-000000000002'
);

------------------------------------------------------------------------------
-- Who may call what

-- Details and periods are set with the secret key only, for `actor`.
revoke execute on function public.set_payroll_details(uuid, uuid, uuid, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.set_payroll_details(uuid, uuid, uuid, jsonb, timestamptz)
  to service_role;
revoke execute on function public.set_employment_period(uuid, uuid, uuid, date, date, date, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.set_employment_period(uuid, uuid, uuid, date, date, date, uuid, timestamptz)
  to service_role;
-- Replaced above; its grants stay as 20261110000500_hourly_wages.sql set them.
revoke execute on function public.set_hourly_wage(uuid, uuid, uuid, integer, date, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.set_hourly_wage(uuid, uuid, uuid, integer, date, text, timestamptz)
  to service_role;

-- Who is a minor: asked with the person's own session; it answers only a
-- manager or an owner.
revoke execute on function public.team_youth(uuid) from public, anon;
grant execute on function public.team_youth(uuid) to authenticated;

-- The rest run inside the functions, triggers and reset above, as their owner.
revoke execute on function private.minimum_wage_for(uuid, uuid, date)
  from public, anon, authenticated;
revoke execute on function private.refuse_payroll_record_delete()
  from public, anon, authenticated;
revoke execute on function private.track_employment() from public, anon, authenticated;
revoke execute on function private.backfill_employment_periods()
  from public, anon, authenticated, service_role;
revoke execute on function private.seed_demo_details(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function private.seed_demo_pay(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.purge_business_records(uuid)
  from public, anon, authenticated, service_role;
