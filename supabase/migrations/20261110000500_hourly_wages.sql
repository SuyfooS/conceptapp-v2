-- Hourly wages (payroll P4; Orel, 8 and 9 November 2026, issue #1): each
-- person's wage from a day, kept as its history, and the minimum wage beside
-- it. No estimate and no amount worked out from hours: those are P6 and P7.
--
--   wages     public.member_wages: a person's hourly wage, in whole agorot,
--             from a day. Append-only: the wage on a day is the row with the
--             latest effective_from on or before it, then the latest set_at,
--             so a typo is fixed by a new row for the same day and both stay
--             in the history. Each person reads their own while a member; pay
--             holders (clock.payroll) and a view as an accountant read the
--             business's. Nothing changes or deletes a row but the demo
--             reset's purge (20261110000100_hours_kept.sql's rules), and the
--             one who set it going to null when their account goes.
--   setting   public.set_hourly_wage, with the secret key for `actor`: a pay
--             holder, never for their own wage; an owner's wage only by an
--             owner; never an accountant's, who has no hours here. From the
--             first of last month to a year ahead, by the business's own day.
--             Under the minimum it still saves: the screens warn in words, and
--             the log keeps the minimum of that day beside it.
--   minimum   public.minimum_wages: Israel's minimum wage by the day it took
--             effect, every figure as published (35.40 from 1.4.2026, not
--             6,443.85 ÷ 182). @domain/minimum-wage holds the same rows, and
--             packages/db/minimum-wages.db.test.ts keeps the two equal. The
--             2025 youth figures were worked out, not read: they must be
--             checked against the official publication before a business pays
--             a minor from them (docs/ROADMAP.md, known issues).
--   lines     the person is told their wage changed (pay.wage_set), with the
--             day it takes effect and never the amount.
--   demo      managers 45.00 and workers 38.00 from the first of last month,
--             and the cases a definition's "wages" names, put back by every
--             reset through private.seed_demo_pay.

------------------------------------------------------------------------------
-- 1. The minimum wage

create table public.minimum_wages (
  effective_from date primary key,
  monthly_agorot integer not null check (monthly_agorot > 0),
  -- The Ministry's 182-hour figure, as published (cut, not rounded).
  hourly_agorot integer not null check (hourly_agorot > 0),
  -- The statute's 186-hour figure, for the payroll file's notes.
  statute_hourly_agorot integer not null check (statute_hourly_agorot > 0),
  -- Minors, by the exact birthday: 70% under 16, 75% from 16, 83% from 17,
  -- 60% for an apprentice, of the monthly figure, ÷ 173.
  under16_hourly_agorot integer not null check (under16_hourly_agorot > 0),
  age16_hourly_agorot integer not null check (age16_hourly_agorot > 0),
  age17_hourly_agorot integer not null check (age17_hourly_agorot > 0),
  apprentice_hourly_agorot integer not null check (apprentice_hourly_agorot > 0),
  -- The youth figures were read from a publication; false when worked out.
  youth_published boolean not null,
  source text not null check (btrim(source) <> ''),
  check (
    under16_hourly_agorot < age16_hourly_agorot
    and age16_hourly_agorot < age17_hourly_agorot
    and age17_hourly_agorot < hourly_agorot
    and apprentice_hourly_agorot < under16_hourly_agorot
  )
);

insert into public.minimum_wages (
  effective_from, monthly_agorot, hourly_agorot, statute_hourly_agorot,
  under16_hourly_agorot, age16_hourly_agorot, age17_hourly_agorot,
  apprentice_hourly_agorot, youth_published, source
)
values
  -- The youth figures of this row were worked out (70/75/83/60% of 6,247.67,
  -- rounded to agorot, ÷ 173, rounded), not read: check them against the
  -- official youth table for 1.4.2025 before a business pays a minor from them.
  ('2025-04-01', 624767, 3432, 3358, 2528, 2709, 2997, 2167, false,
   'National Insurance (BTL) adult figures, 1.4.2025; youth worked out from the percentages'),
  ('2026-04-01', 644385, 3540, 3464, 2607, 2794, 3092, 2235, true,
   'Reshumot 4.3.2026; Kol Zchut, שכר מינימום (17.8.2026) and שכר מינימום לנוער (21.6.2026)');

alter table public.minimum_wages enable row level security;
revoke all on public.minimum_wages from anon, authenticated;
revoke insert, update, delete, truncate on public.minimum_wages from service_role;
grant select on public.minimum_wages to authenticated;

-- A published figure, the same for every business: anyone signed in reads it.
-- Written only by migrations.
create policy "anyone signed in reads the minimum wage"
  on public.minimum_wages for select to authenticated
  using (true);

comment on table public.minimum_wages is
  'Israel''s minimum wage by the day it took effect, as published, in agorot: adult hourly (182 hours), the statute''s 186-hour figure and the youth bands. Written only by migrations; @domain/minimum-wage holds the same rows.';

-- The adult hourly minimum in effect on a day, in agorot; null before the
-- table's first row. (Payroll P5 brings the bands by age.)
create function private.minimum_wage_on(on_day date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select w.hourly_agorot
  from public.minimum_wages w
  where w.effective_from <= on_day
  order by w.effective_from desc
  limit 1
$$;

------------------------------------------------------------------------------
-- 2. Wages

create table public.member_wages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  user_id uuid not null,
  hourly_agorot integer not null check (hourly_agorot between 1 and 100000),
  effective_from date not null,
  note text check (
    note is null or (char_length(note) between 1 and 200 and note = btrim(note))
  ),
  set_by uuid references public.profiles (id) on delete set null,
  set_at timestamptz not null default now(),
  -- A record, as hours are: someone who leaves is made inactive, never
  -- deleted, and a person or business with wages stays (23503).
  foreign key (business_id, user_id)
    references public.memberships (business_id, user_id) on delete restrict
);

create index member_wages_person_idx
  on public.member_wages (business_id, user_id, effective_from desc, set_at desc);
create index member_wages_set_by_idx on public.member_wages (set_by);

alter table public.member_wages enable row level security;
revoke all on public.member_wages from anon, authenticated;
-- Written only through public.set_hourly_wage (and the demo's seed); a
-- truncate would skip the trigger below.
revoke insert, update, delete, truncate on public.member_wages from service_role;
grant select on public.member_wages to authenticated;

create policy "people read their own wage, pay holders the business's"
  on public.member_wages for select to authenticated
  using (
    private.module_enabled(business_id, 'time_clock')
    and (
      (user_id = (select auth.uid()) and private.is_member(business_id))
      or private.has_perm(business_id, 'clock.payroll')
      or private.viewing_payroll(business_id)
    )
  );

comment on table public.member_wages is
  'Each person''s hourly wage in agorot from a day, append-only: the wage on a day is the latest effective_from on or before it, then the latest set_at. Read by the person and by pay holders (clock.payroll); written only by public.set_hourly_wage; deleted only by a demo reset (private.purge_business_records).';

-- Nothing changes a wage, and nothing deletes one but a purge that names the
-- business (private.deleting_allowed, every comparison wrapped, so a fresh
-- session fails closed). The one change let through: who set it going to null
-- when their account goes (set_by is `on delete set null`), with nothing else.
create function private.refuse_wage_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if private.deleting_allowed(old.business_id, null::uuid) then
      return old;
    end if;
    raise exception 'Wages are kept: a new row corrects one' using errcode = '42501';
  end if;

  if new.set_by is null and old.set_by is not null
    and (new.id, new.business_id, new.user_id, new.hourly_agorot,
        new.effective_from, new.note, new.set_at)
      is not distinct from (old.id, old.business_id, old.user_id,
        old.hourly_agorot, old.effective_from, old.note, old.set_at)
  then
    return new;
  end if;
  raise exception 'Wages are kept: a new row corrects one' using errcode = '42501';
end;
$$;

create trigger member_wages_kept before update or delete on public.member_wages
  for each row execute function private.refuse_wage_change();

-- The wage in effect for a person on a day, in agorot; null when none is.
create function private.wage_on(business uuid, person uuid, on_day date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select w.hourly_agorot
  from public.member_wages w
  where w.business_id = business
    and w.user_id = person
    and w.effective_from <= on_day
  order by w.effective_from desc, w.set_at desc
  limit 1
$$;

-- Set a person's hourly wage from a day, for `actor`, with the secret key.
-- The parameters are named apart from member_wages' columns (from_day,
-- wage_note). The person may have left (their last months are still paid). A
-- new row for a day that has one corrects it: both stay. The log row carries
-- the wage before on that day and after, and the adult minimum of the day.
create function public.set_hourly_wage(
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

  was_agorot := private.wage_on(business, person, from_day);
  floor_agorot := private.minimum_wage_on(from_day);

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
-- 3. The demo reset's purge: 20261110000100_hours_kept.sql's, with the wages
--    before the log.

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
  -- P5 (member_payroll_details, employment_periods) and P9 (payroll_months)
  -- replace this function and delete theirs here.
  delete from public.audit_log a where a.business_id = business;
  perform set_config('ca.records_purge', coalesce(prior, ''), true);
end;
$$;

------------------------------------------------------------------------------
-- 4. The line a person gets when their wage changes

-- Payroll's lines (20261110000400_payroll_screens.sql's, with the wage): a
-- personal grant of clock.payroll tells the person and taking it back settles
-- the line, as before; a wage set for someone tells them, with the day it
-- takes effect (`since`, not `from`, which names a person in the app's lines)
-- and never the amount. One line per person: a later change brings it back,
-- unread. P9 (a month closed) replaces this.
create or replace function private.notify_for_payroll(entry public.audit_log)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  person uuid;
begin
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

drop trigger audit_log_notifies_payroll on public.audit_log;
create trigger audit_log_notifies_payroll
  after insert on public.audit_log
  for each row
  when (new.action in ('permission.grant', 'permission.revoke', 'wage.set'))
  execute function private.notify_payroll_from_log();

------------------------------------------------------------------------------
-- 5. The demo: last month's wages

-- Last month's wages of a demo business, as its definition's "wages" says:
--   {"manager": 4500, "worker": 3800,
--    "cases": [{"user_id": "…", "case": "raise", "agorot": 3600}, …]}
-- Every active manager and worker gets their role's wage from the first of
-- last month, by the business's clock; the owner and an accountant none. The
-- cases, each on the person it names:
--   raise   the case's "agorot" from the first of last month, and the role's
--           wage from its 15th: a raise inside the month
--   none    no wage at all, for the screens that say so
-- Set by the definition's first owner, at 08:00 on the day each takes effect.
-- No log rows, so no lines: the demo starts with its wages, nobody set them
-- today. Whatever goes wrong here, the reset still stands.
create function private.seed_demo_wages(business uuid, wages_plan jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text;
  first_day date;
  setter uuid;
begin
  if jsonb_typeof(wages_plan) is distinct from 'object' then
    return;
  end if;

  begin
    select b.timezone into tz from public.businesses b where b.id = business;
    if tz is null then
      return;
    end if;

    -- The first of last month, by the business's clock.
    first_day := (date_trunc('month', now() at time zone tz) - interval '1 month')::date;

    select m.user_id into setter
    from private.demo_businesses d
    cross join lateral jsonb_array_elements(d.definition -> 'people')
      with ordinality as p (value, ordinality)
    join public.memberships m
      on m.business_id = business and m.user_id::text = p.value ->> 'user_id' and m.active
    where d.business_id = business and m.role = 'owner'
    order by p.ordinality
    limit 1;

    with cases as (
      select c.value ->> 'user_id' as user_text,
        c.value ->> 'case' as kind,
        case when jsonb_typeof(c.value -> 'agorot') = 'number'
          then (c.value ->> 'agorot')::integer end as start_agorot
      from jsonb_array_elements(
        case when jsonb_typeof(wages_plan -> 'cases') = 'array'
          then wages_plan -> 'cases' else '[]'::jsonb end
      ) as c (value)
    ),
    staff as (
      select m.user_id,
        case m.role
          when 'manager' then case when jsonb_typeof(wages_plan -> 'manager') = 'number'
            then (wages_plan ->> 'manager')::integer end
          when 'worker' then case when jsonb_typeof(wages_plan -> 'worker') = 'number'
            then (wages_plan ->> 'worker')::integer end
        end as role_agorot,
        (select c.kind from cases c where c.user_text = m.user_id::text limit 1) as kind,
        (select c.start_agorot from cases c where c.user_text = m.user_id::text limit 1)
          as start_agorot
      from public.memberships m
      where m.business_id = business and m.active and m.role in ('manager', 'worker')
    ),
    planned as (
      select s.user_id, s.role_agorot as agorot, first_day as from_day
      from staff s
      where s.kind is null or s.kind not in ('raise', 'none')
      union all
      select s.user_id, s.start_agorot, first_day
      from staff s
      where s.kind = 'raise'
      union all
      select s.user_id, s.role_agorot, first_day + 14
      from staff s
      where s.kind = 'raise'
    )
    insert into public.member_wages (
      business_id, user_id, hourly_agorot, effective_from, set_by, set_at
    )
    select business, w.user_id, w.agorot, w.from_day, setter,
      (w.from_day + '08:00'::time) at time zone tz
    from planned w
    where w.agorot is not null
    order by w.user_id, w.from_day;
  exception when others then
    raise warning 'The demo''s wages were not written: %', sqlerrm;
  end;
end;
$$;

-- What a demo business starts with on the pay side
-- (20261110000400_payroll_screens.sql's, now with its wages): the role grants
-- its definition names (`rolePermissions`), last month's hours (`hours`), and
-- its wages (`wages`). P5 replaces this, never the reset.
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
end;
$$;

-- The hosted demo businesses, by their fixed ids (supabase/hosted-demo.sql says
-- the same, for the workflow's "demo" step): the shop's third worker gets a
-- raise inside the month, the restaurant's second worker no wage. Both start
-- again with them. Locally the seed runs after the migrations, with its own.
update private.demo_businesses d
set definition = d.definition || $json$
  {"wages": {"manager": 4500, "worker": 3800, "cases": [
    {"user_id": "10000000-0000-4000-a000-000000000110", "case": "raise", "agorot": 3600}
  ]}}
  $json$::jsonb
where d.business_id = '10000000-0000-4000-b000-000000000002';

update private.demo_businesses d
set definition = d.definition || $json$
  {"wages": {"manager": 4500, "worker": 3800, "cases": [
    {"user_id": "10000000-0000-4000-a000-000000000105", "case": "none"}
  ]}}
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

-- Wages are set with the secret key only, for `actor`.
revoke execute on function public.set_hourly_wage(uuid, uuid, uuid, integer, date, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.set_hourly_wage(uuid, uuid, uuid, integer, date, text, timestamptz)
  to service_role;

-- The rest run inside the functions, triggers and reset above, as their owner.
revoke execute on function private.minimum_wage_on(date) from public, anon, authenticated;
revoke execute on function private.wage_on(uuid, uuid, date) from public, anon, authenticated;
revoke execute on function private.refuse_wage_change() from public, anon, authenticated;
revoke execute on function private.notify_for_payroll(public.audit_log)
  from public, anon, authenticated;
revoke execute on function private.seed_demo_wages(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function private.seed_demo_pay(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.purge_business_records(uuid)
  from public, anon, authenticated, service_role;
