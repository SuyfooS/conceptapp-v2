-- The pay screens (payroll P3; Orel, 8 and 9 November 2026, issue #1): what
-- the accountant, the owner and everyone given pay access read and do on screen.
-- The access itself is 20261110000300_payroll_access.sql's; this adds what the
-- screens write, the line a person given access gets, and the demo's hours.
--
--   views     public.note_payroll_access: someone holding clock.payroll, or
--             viewing as an accountant, opened the pay screens. Logged as
--             payroll.view, once a day per person in the business's own day,
--             with the person's own session. The app calls it from a server
--             action after the page is on screen, never while it renders, so a
--             prefetch logs nothing. A pay row: only pay holders read it, and
--             the activity list leaves it out as routine.
--   lines     private.notify_for_payroll, on a trigger of its own (the lists
--             pattern, so private.notify_for stays as it is): a person given
--             pay access is told (access.pay_granted); taking it back settles
--             the line. P4 and P9 replace it and widen the trigger's list.
--   demo      the shop's accountant, Galit (supabase/seed.sql,
--             supabase/hosted-demo.sql), and last month's hours for every demo
--             member on the staff but the owner, with the cases the pay screens
--             and the hours engine show (a definition's "hours"). Every reset
--             puts them back, through private.seed_demo_pay.

------------------------------------------------------------------------------
-- 1. Opening the pay screens

-- `pay_month` is the month on screen (any day of it), `view_kind` what was
-- opened: everyone's month, one person's, or who sees pay (/manage/access).
-- Someone without pay access gets nothing written, and no error: the screens
-- were closed to them already.
create function public.note_payroll_access(
  business uuid,
  pay_month date,
  view_kind text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  tz text;
begin
  if view_kind is null or view_kind not in ('month', 'person', 'access') then
    raise exception 'Unknown view of the pay screens: %', coalesce(view_kind, 'none')
      using errcode = '22023';
  end if;

  if pay_month is null then
    raise exception 'Say which month was opened' using errcode = '22023';
  end if;

  if me is null
    or not (private.has_perm(business, 'clock.payroll') or private.viewing_payroll(business))
  then
    return;
  end if;

  select b.timezone into tz from public.businesses b where b.id = business;
  if not found then
    return;
  end if;

  -- Two tabs opening at once write one row.
  perform pg_advisory_xact_lock(
    hashtextextended('payroll.view:' || business::text || ':' || me::text, 0)
  );

  -- Once a day, by the business's own clock.
  if exists (
    select 1
    from public.audit_log a
    where a.business_id = business
      and a.actor_id = me
      and a.action = 'payroll.view'
      and a.created_at >= (date_trunc('day', now() at time zone tz) at time zone tz)
  ) then
    return;
  end if;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, me, 'payroll.view',
    jsonb_build_object('month', to_char(pay_month, 'YYYY-MM'), 'kind', view_kind)
  );
end;
$$;

------------------------------------------------------------------------------
-- 2. The line a person given pay access gets

-- Payroll's lines (the lists pattern: private.notify_for_lists). A personal
-- grant of clock.payroll tells the person, once per grant; taking it back
-- settles the line. A role's grant tells nobody: it changes what a role holds,
-- not one person's work. P4 (a wage set) and P9 (a month closed) replace this.
create function private.notify_for_payroll(entry public.audit_log)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  person uuid;
begin
  if entry.details ->> 'perm' is distinct from 'clock.payroll'
    or not (entry.details ? 'person')
  then
    return;
  end if;
  person := (entry.details ->> 'person')::uuid;

  case entry.action
  when 'permission.grant' then
    perform private.notify(
      entry.business_id, array[person], 'access.pay_granted', '{}'::jsonb,
      entry.actor_id, 'time_clock'::public.module_key, 'worker'::public.member_role,
      'access.pay:' || person::text
    );
  when 'permission.revoke' then
    perform private.resolve_notifications(entry.business_id, 'access.pay:' || person::text);
  else
    null;
  end case;
end;
$$;

-- The trigger: what happened stands, whatever telling people about it does.
create function private.notify_payroll_from_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform private.notify_for_payroll(new);
  exception when others then
    raise warning 'payroll notifications for % (%) failed: %', new.action, new.id, sqlerrm;
  end;
  return null;
end;
$$;

create trigger audit_log_notifies_payroll
  after insert on public.audit_log
  for each row
  when (new.action in ('permission.grant', 'permission.revoke'))
  execute function private.notify_payroll_from_log();

------------------------------------------------------------------------------
-- 3. The demo: last month's hours

-- Last month's hours of a demo business, as its definition's "hours" says:
--   {"fridays": true, "cases": [{"user_id": "…", "case": "friday_late"}, …]}
-- Every active member on the staff but the owner works Sunday to Thursday
-- 09:00–17:00, with a break 13:00–13:30 that is unpaid when the business's
-- breaks are, and takes one of those days off each week, by their place in the
-- definition; with "fridays", workers also work Friday 08:00–14:00. The cases,
-- each on the person it names, are what the pay screens and the hours engine
-- (P6) show; each on its own weekday, so no two meet:
--   corrected       the month's first Monday: they forgot to leave, and the
--                   first manager in the definition set 17:00 the next morning,
--                   with the case's "note" and its clock.correct row
--   evening         its last Tuesday, 18:00–22:30 instead
--   without_code    its second Wednesday, clocked in without a code, still
--                   waiting for a manager
--   night           its last Thursday, 22:00–06:30 instead
--   friday_late     its last Friday, 12:00–21:00 instead, past candle lighting
--   saturday_night  its last Saturday, 20:00–01:00
-- Times are the business's own clock, in its time zone, so the month is right
-- on any day the reset runs. No entry is left open: an open one would block
-- the person's next punch. Whatever goes wrong here, the reset still stands.
create function private.seed_demo_hours(business uuid, hours_plan jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text;
  breaks_unpaid boolean;
  last_day date;
  first_day date;
  corrector uuid;
  fixed record;
begin
  if jsonb_typeof(hours_plan) is distinct from 'object' then
    return;
  end if;

  begin
    select b.timezone, coalesce((m.settings ->> 'unpaidBreaks')::boolean, false)
    into tz, breaks_unpaid
    from public.businesses b
    left join public.business_modules m
      on m.business_id = b.id and m.module_key = 'time_clock'
    where b.id = business;
    if tz is null then
      return;
    end if;

    -- The day before this month began, by the business's clock, and the
    -- first of its month.
    last_day := date_trunc('month', now() at time zone tz)::date - 1;
    first_day := date_trunc('month', last_day::timestamp)::date;

    -- Who corrects: the first manager in the definition, else its owner.
    select m.user_id into corrector
    from private.demo_businesses d
    cross join lateral jsonb_array_elements(d.definition -> 'people')
      with ordinality as p (value, ordinality)
    join public.memberships m
      on m.business_id = business and m.user_id::text = p.value ->> 'user_id' and m.active
    where d.business_id = business and m.role in ('manager', 'owner')
    order by m.role = 'manager' desc, p.ordinality
    limit 1;

    with days as (
      select g::date as day, extract(dow from g)::integer as weekday
      from generate_series(first_day::timestamp, last_day::timestamp, interval '1 day') as g
    ),
    staff as (
      select m.user_id, m.role, row_number() over (order by p.ordinality) as place
      from private.demo_businesses d
      cross join lateral jsonb_array_elements(d.definition -> 'people')
        with ordinality as p (value, ordinality)
      join public.memberships m
        on m.business_id = business and m.user_id::text = p.value ->> 'user_id' and m.active
      where d.business_id = business and m.role in ('manager', 'worker')
    ),
    -- Each case on its day of the month.
    cases as (
      select c.value ->> 'user_id' as user_text,
        c.value ->> 'case' as kind,
        nullif(btrim(coalesce(c.value ->> 'note', '')), '') as note_text,
        case c.value ->> 'case'
          when 'corrected' then (select min(x.day) from days x where x.weekday = 1)
          when 'evening' then (select max(x.day) from days x where x.weekday = 2)
          when 'without_code' then (select min(x.day) + 7 from days x where x.weekday = 3)
          when 'night' then (select max(x.day) from days x where x.weekday = 4)
          when 'friday_late' then (select max(x.day) from days x where x.weekday = 5)
          when 'saturday_night' then (select max(x.day) from days x where x.weekday = 6)
        end as day
      from jsonb_array_elements(
        case when jsonb_typeof(hours_plan -> 'cases') = 'array'
          then hours_plan -> 'cases' else '[]'::jsonb end
      ) as c (value)
    ),
    -- The usual days, without the ones a case takes instead.
    usual as (
      select s.user_id, x.day,
        case when x.weekday = 5 then '08:00'::time else '09:00'::time end as starts,
        case when x.weekday = 5 then '14:00'::time else '17:00'::time end as ends
      from staff s
      cross join days x
      where (
          (x.weekday between 0 and 4 and x.weekday <> (s.place - 1) % 5)
          or (x.weekday = 5 and s.role = 'worker'
            and coalesce((hours_plan ->> 'fridays')::boolean, false))
        )
        and not exists (
          select 1 from cases c
          where c.user_text = s.user_id::text and c.day = x.day
        )
    ),
    shifts as (
      select u.user_id, u.day, u.starts, u.ends,
        null::text as kind, null::text as note_text
      from usual u
      union all
      select s.user_id, c.day,
        case c.kind
          when 'evening' then '18:00'::time
          when 'night' then '22:00'::time
          when 'friday_late' then '12:00'::time
          when 'saturday_night' then '20:00'::time
          else '09:00'::time
        end,
        case c.kind
          when 'evening' then '22:30'::time
          when 'night' then '06:30'::time
          when 'friday_late' then '21:00'::time
          when 'saturday_night' then '01:00'::time
          else '17:00'::time
        end,
        c.kind, c.note_text
      from cases c
      join staff s on s.user_id::text = c.user_text
      where c.day between first_day and last_day
        and (c.kind <> 'corrected' or corrector is not null)
    )
    insert into public.time_entries (
      business_id, user_id, clock_in, clock_out, source, in_proof, out_proof,
      note, edited_by, edited_at
    )
    select business, s.user_id,
      (s.day + s.starts) at time zone tz,
      (case when s.ends <= s.starts then s.day + 1 else s.day end + s.ends) at time zone tz,
      'punch'::public.time_entry_source,
      case when s.kind = 'without_code' then 'none' else 'off' end,
      case when s.kind = 'corrected' then 'manager' else 'off' end,
      case when s.kind = 'corrected' then coalesce(s.note_text, '-') end,
      case when s.kind = 'corrected' then corrector end,
      case when s.kind = 'corrected' then (s.day + 1 + '10:00'::time) at time zone tz end
    from shifts s
    order by s.day, s.user_id;

    -- The usual weekday's break.
    insert into public.time_breaks (entry_id, business_id, user_id, started_at, ended_at, unpaid)
    select e.id, business, e.user_id,
      ((e.clock_in at time zone tz)::date + '13:00'::time) at time zone tz,
      ((e.clock_in at time zone tz)::date + '13:30'::time) at time zone tz,
      breaks_unpaid
    from public.time_entries e
    where e.business_id = business
      and e.clock_in >= (first_day::timestamp at time zone tz)
      and e.clock_in < ((last_day + 1)::timestamp at time zone tz)
      and (e.clock_in at time zone tz)::time = '09:00'::time
      and (e.clock_out at time zone tz)::time = '17:00'::time;

    -- The correction's row, on the morning it was made, as correct_time_entry
    -- writes it.
    for fixed in
      select e.id, e.user_id, e.clock_in, e.clock_out, e.note, e.edited_by, e.edited_at
      from public.time_entries e
      where e.business_id = business
        and e.edited_by is not null
        and e.clock_in >= (first_day::timestamp at time zone tz)
        and e.clock_in < ((last_day + 1)::timestamp at time zone tz)
    loop
      insert into public.audit_log (business_id, actor_id, action, details, created_at)
      values (
        business, fixed.edited_by, 'clock.correct',
        jsonb_build_object(
          'entry', fixed.id, 'person', fixed.user_id,
          'from', jsonb_build_object('clock_in', fixed.clock_in, 'clock_out', null),
          'to', jsonb_build_object('clock_in', fixed.clock_in, 'clock_out', fixed.clock_out),
          'proof', jsonb_build_object('in', 'off', 'out', 'manager'),
          'note', fixed.note
        ),
        fixed.edited_at
      );
    end loop;
  exception when others then
    raise warning 'The demo''s hours were not written: %', sqlerrm;
  end;
end;
$$;

-- What a demo business starts with on the pay side (20261110000300_payroll_access.sql's,
-- now with its hours): the role grants its definition names (`rolePermissions`,
-- a list of {role, perm}), then last month's hours (`hours`). P4 and P5 replace
-- this, never the reset.
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
end;
$$;

-- The hosted demo businesses, by their fixed ids (supabase/hosted-demo.sql says
-- the same, for the workflow's "demo" step): the shop's accountant, and each
-- one's hours. Both start again with them. The reset leaves out a person
-- without an account, so before the demo step makes Galit's she has no place
-- in the shop yet; that step then starts the shop again, as it does any demo
-- business missing someone with an account, and she joins. Locally the seed
-- runs after the migrations, with its own.
update private.demo_businesses d
set definition = jsonb_set(
  d.definition, '{people}',
  coalesce(d.definition -> 'people', '[]'::jsonb)
    || '[{"user_id": "10000000-0000-4000-a000-000000000112", "role": "accountant", "name": "גלית הדגמה"}]'::jsonb
)
where d.business_id = '10000000-0000-4000-b000-000000000002'
  and not coalesce(d.definition -> 'people', '[]'::jsonb)
    @> '[{"user_id": "10000000-0000-4000-a000-000000000112"}]'::jsonb;

update private.demo_businesses d
set definition = d.definition || $json$
  {"hours": {"fridays": true, "cases": [
    {"user_id": "10000000-0000-4000-a000-000000000108", "case": "friday_late"},
    {"user_id": "10000000-0000-4000-a000-000000000108", "case": "corrected", "note": "שכחה לצאת"},
    {"user_id": "10000000-0000-4000-a000-000000000109", "case": "saturday_night"},
    {"user_id": "10000000-0000-4000-a000-000000000109", "case": "without_code"},
    {"user_id": "10000000-0000-4000-a000-000000000111", "case": "evening"}
  ]}}
  $json$::jsonb
where d.business_id = '10000000-0000-4000-b000-000000000002';

update private.demo_businesses d
set definition = d.definition || $json$
  {"hours": {"fridays": false, "cases": [
    {"user_id": "10000000-0000-4000-a000-000000000105", "case": "night"}
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

-- The screens note a view with the person's own session; the function logs
-- only the caller.
revoke execute on function public.note_payroll_access(uuid, date, text) from public, anon;
grant execute on function public.note_payroll_access(uuid, date, text) to authenticated;

-- The rest run inside the trigger and the reset, as their owner.
revoke execute on function private.notify_for_payroll(public.audit_log)
  from public, anon, authenticated;
revoke execute on function private.notify_payroll_from_log()
  from public, anon, authenticated;
revoke execute on function private.seed_demo_hours(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function private.seed_demo_pay(uuid)
  from public, anon, authenticated, service_role;
