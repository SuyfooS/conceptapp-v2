-- Sample availability for next week in the hosted demo (filling the schedule
-- from availability, part 6; Orel's answer to the plan's question 3, 25
-- November 2026). The hosted demo restaurant's manager and two workers have
-- next week's availability sent already, so whoever shows the builder's
-- "מילוי מהזמינות" has someone to fill from, and it comes back after every
-- reset.
--
--   the data     a demo business's definition (private.demo_businesses) may
--                name `sampleAvailability`: [{user_id, ranges: [{weekday,
--                start, end}]}], weekday 0 = Sunday, times "HH:MM", an end at
--                or before the start on the next day, as in a sent answer.
--                Only supabase/hosted-demo.sql's restaurant has it;
--                supabase/seed.sql has none, so the local e2e is as it was.
--   the renewal  public.renew_demo_availability(), with the secret key, from
--                the demo door (enterAs in app/(auth)/enter/actions.ts): for
--                each demo business whose definition has the key, with
--                scheduling on, next week by its own settings and clock
--                (private.availability_rules, private.week_start_after: the
--                week the availability form answers for), unless that week
--                is published. For each person it names who is active on the
--                business's staff and owes availability (a manager or a
--                worker, as private.availability_missing counts them: never
--                an owner, an accountant or someone who left) and sent
--                nothing for that week, it opens the week
--                (public.open_schedule_week, due when the settings say,
--                private.availability_due_at) and sends their ranges through
--                public.submit_availability with no note, so every rule of a
--                sent answer holds. An answer someone sent, an empty one too,
--                is never touched: the person's row is claimed first (`on
--                conflict do nothing`), so an answer sent at the same moment
--                either stops the sample or replaces it afterwards. Returns
--                how many answers it wrote, 0 when called again.
--   Shabbat      for a business closed on Shabbat (private.closes_on_shabbat),
--                each range is cut as the form's suggestion is
--                (@domain/availability-form's suggestedDay): on Friday it
--                ends by candle lighting, on Saturday it starts from havdalah
--                (private.shabbat_span, by the business's city). A range left
--                with nothing, or on a Friday or Saturday past the table's
--                last Shabbat, is left out, and a person with no range left
--                gets no answer (private.demo_sample_ranges).
--   nothing else no row of the log, no notification, so no push either:
--                submit_availability writes the answer and its ranges only,
--                and the one trigger after a new answer
--                (availability_submissions_resolve) only settles reminders,
--                which a demo business never gets (private.run_reminders
--                leaves demo businesses out); availability_staff_only only
--                refuses an accountant. A demo business sends no SMS.
--   the reset    public.reset_demo_business is unchanged: a reset deletes the
--                weeks with the business, and the next entry at the door
--                writes the sample again.
--   locks        the business (`for key share`, so a demo reset under way
--                finishes first; a business it made again meanwhile waits for
--                the next call), then next week's row (`for share`, as a
--                write of the week next door takes it), then each person's
--                answer.

------------------------------------------------------------------------------
-- 1. A person's sample ranges, as they are sent

-- `given` ([{weekday, start, end}]) as the ranges of an answer for the week
-- starting on `week_start`: each weekday on its date in that week, by the
-- business's first day, earliest first, cut by Shabbat for a business closed
-- on Shabbat (the header). A weekday outside 0 to 6 is left out. Empty when
-- nothing is left.
create function private.demo_sample_ranges(
  business uuid,
  week_start date,
  given jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with rules as (
    select r.first_day, r.tz_name, private.closes_on_shabbat(business) as closed
    from private.availability_rules(business) r
  ),
  sample as (
    -- Minutes from the day's midnight; an end at or before the start is the
    -- next day, as submit_availability reads it.
    select week_start + ((r.weekday - rules.first_day + 7) % 7) as day,
      extract(epoch from r.start::time)::int / 60 as from_minute,
      extract(epoch from r."end"::time)::int / 60
        + case when r."end"::time <= r.start::time then 1440 else 0 end as to_minute,
      rules.closed,
      rules.tz_name
    from rules
    cross join jsonb_to_recordset(
      case when jsonb_typeof(given) = 'array' then given else '[]'::jsonb end
    ) as r (weekday integer, start text, "end" text)
    where r.weekday between 0 and 6
  ),
  shabbat as (
    select s.day, s.from_minute, s.to_minute, s.tz_name,
      s.closed and extract(dow from s.day)::int in (5, 6) as cut,
      case when s.closed and extract(dow from s.day)::int in (5, 6)
        then private.shabbat_span(business, s.day)
      end as span
    from sample s
  ),
  kept as (
    select sh.day,
      case when sh.cut and extract(dow from sh.day)::int = 6
        then greatest(
          sh.from_minute,
          extract(epoch from (upper(sh.span) at time zone sh.tz_name)::time)::int / 60
        )
        else sh.from_minute
      end as from_minute,
      case when sh.cut and extract(dow from sh.day)::int = 5
        then least(
          sh.to_minute,
          extract(epoch from (lower(sh.span) at time zone sh.tz_name)::time)::int / 60
        )
        else sh.to_minute
      end as to_minute
    from shabbat sh
    where not sh.cut or sh.span is not null
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'day', k.day::text,
        'start', lpad((k.from_minute / 60 % 24)::text, 2, '0')
          || ':' || lpad((k.from_minute % 60)::text, 2, '0'),
        'end', lpad((k.to_minute / 60 % 24)::text, 2, '0')
          || ':' || lpad((k.to_minute % 60)::text, 2, '0')
      )
      order by k.day, k.from_minute
    ),
    '[]'::jsonb
  )
  from kept k
  where k.from_minute < k.to_minute
$$;

------------------------------------------------------------------------------
-- 2. The renewal

-- Next week's sample availability for each demo business whose definition
-- names it (the header). Safe to call often. Returns how many answers it
-- wrote.
create function public.renew_demo_availability()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  demo record;
  first_day integer;
  tz text;
  week_start date;
  week uuid;
  person record;
  claimed uuid;
  written integer := 0;
begin
  for demo in
    select d.business_id, d.definition -> 'sampleAvailability' as sample
    from private.demo_businesses d
    join public.businesses b on b.id = d.business_id
    where jsonb_typeof(d.definition -> 'sampleAvailability') = 'array'
    order by d.business_id
  loop
    -- A demo reset under way finishes first. One that made the business
    -- again since the list was read leaves it to the next call.
    perform 1 from public.businesses b where b.id = demo.business_id for key share;
    continue when not found;
    continue when not private.module_enabled(
      demo.business_id, 'scheduling'::public.module_key
    );

    select r.first_day, r.tz_name into first_day, tz
    from private.availability_rules(demo.business_id) r;
    week_start := private.week_start_after(now(), tz, first_day);
    week := null;

    for person in
      select s.user_id,
        private.demo_sample_ranges(demo.business_id, week_start, s.ranges) as ranges
      from jsonb_to_recordset(demo.sample) as s (user_id uuid, ranges jsonb)
      join public.memberships m
        on m.business_id = demo.business_id and m.user_id = s.user_id
      where m.active and m.role in ('manager', 'worker')
      order by s.user_id
    loop
      continue when jsonb_array_length(person.ranges) = 0;

      if week is null then
        week := public.open_schedule_week(
          demo.business_id, week_start,
          private.availability_due_at(demo.business_id, week_start)
        );
        -- Under the week's lock, as a write of it takes it: a published week
        -- gets nothing.
        perform 1 from public.schedule_weeks w
        where w.id = week and w.schedule_published_at is null
        for share;
        exit when not found;
      end if;

      -- The person's answer, claimed: one already sent, or sent meanwhile,
      -- stays theirs.
      claimed := null;
      insert into public.availability_submissions (business_id, week_id, user_id)
      values (demo.business_id, week, person.user_id)
      on conflict (week_id, user_id) do nothing
      returning id into claimed;
      continue when claimed is null;

      perform public.submit_availability(person.user_id, week, person.ranges, null);
      written := written + 1;
    end loop;
  end loop;
  return written;
end;
$$;

------------------------------------------------------------------------------
-- 3. Who may call what

revoke execute on function private.demo_sample_ranges(uuid, date, jsonb)
  from public, anon, authenticated;
revoke execute on function public.renew_demo_availability()
  from public, anon, authenticated;
grant execute on function public.renew_demo_availability() to service_role;
