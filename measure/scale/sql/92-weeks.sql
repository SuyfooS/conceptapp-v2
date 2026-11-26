-- 92-weeks: every week of the schedule, the history written directly, the
-- last three through the app's own functions.
--
-- After the history's log (90-log): publishing writes its schedule.publish
-- rows at the anchor, and the activity feed reads by id, so they come after
-- every row of the history. Nothing before this part needs the weeks: the
-- hours tie to no shift, and the bell's history of publishing (80-lines)
-- names its weeks in the lines alone.
--
-- The weeks' rows first, each with the seed's id, then
-- public.open_schedule_week for the three the app writes, which finds each
-- one (and checks it starts on the business's first weekday). History, of
-- both businesses, and every week of the neighbour's, go straight into
-- schedule_shifts and shift_assignments, as
-- supabase/tests/database/lists_schedule.test.sql does: no line for anyone.
-- Last week and this week of the business are published through
-- public.publish_week_schedule as its scheduling manager: a first publish
-- of a week under way tells only those with a shift still to start
-- (private.notify_for). Next week is saved as a draft through
-- public.save_week_schedule, which holds the database's caps: 200 shifts, 1
-- to 50 needed, nobody on two shifts at once, in the week or next to it.
-- Then availability for this week and next, and the requests to swap.

-- step: weeks
insert into public.schedule_weeks (
  id, business_id, starts_on, availability_due_at, created_at, schedule_saved_at,
  schedule_published_at
)
select r.id, r.business, r.starts_on, r.due_at, r.due_at - interval '3 days',
  r.published_at, r.published_at
from jsonb_to_recordset($1::jsonb)
  as r (id uuid, business uuid, starts_on date, due_at timestamptz, published_at timestamptz);

-- step: opened
select 'open_schedule_week gave another week for ' || r.starts_on as problem
from jsonb_to_recordset($1::jsonb)
  as r (id uuid, business uuid, starts_on date, due_at timestamptz)
where public.open_schedule_week(r.business, r.starts_on, r.due_at) is distinct from r.id;

-- step: history_shifts
insert into public.schedule_shifts (
  id, business_id, week_id, day, pattern_key, name, starts_at, ends_at, needed, opens_lists_from
)
select r.id, r.business, r.week, r.day, r.pattern, r.name, r.starts_at, r.ends_at, r.needed,
  r.published_at
from jsonb_to_recordset($1::jsonb)
  as r (id uuid, business uuid, week uuid, day date, pattern text, name text, starts_at time,
    ends_at time, needed integer, published_at timestamptz);

-- step: history_assignments
insert into public.shift_assignments (shift_id, business_id, user_id, position_key)
select r.shift, r.business, r.person, r.position_key
from jsonb_to_recordset($1::jsonb)
  as r (shift uuid, business uuid, person uuid, position_key text);

-- step: published
select public.publish_week_schedule(
  r.actor, r.week, r.shifts, at_time => current_setting('scale.anchor')::timestamptz
)
from jsonb_to_recordset($1::jsonb) as r (actor uuid, week uuid, shifts jsonb);

-- step: draft
select public.save_week_schedule(
  r.actor, r.week, r.shifts, at_time => current_setting('scale.anchor')::timestamptz
)
from jsonb_to_recordset($1::jsonb) as r (actor uuid, week uuid, shifts jsonb);

-- step: availability
insert into public.availability_submissions (
  id, business_id, week_id, user_id, submitted_at, updated_at
)
select r.id, r.business, r.week, r.person, r.submitted_at, r.submitted_at
from jsonb_to_recordset($1::jsonb)
  as r (id uuid, business uuid, week uuid, person uuid, submitted_at timestamptz);

-- step: ranges
insert into public.availability_ranges (id, submission_id, day, starts_at, ends_at)
select r.id, r.submission, r.day, r.starts_at, r.ends_at
from jsonb_to_recordset($1::jsonb)
  as r (id uuid, submission uuid, day date, starts_at time, ends_at time);

-- step: swaps
insert into public.shift_swaps (
  id, business_id, shift_id, requested_by, status, taken_by, taken_at, decided_by,
  decided_at, cancelled_because, created_at, shift
)
select r.id, r.business, s.id, r.requested_by, r.status::public.swap_status, r.taken_by,
  case when r.taken_by is not null then r.created_at + interval '12 hours' end,
  r.decided_by, r.decided_at, r.cancelled_because, r.created_at, private.shift_brief(s.id)
from jsonb_to_recordset($1::jsonb)
  as r (id uuid, business uuid, shift uuid, week_start date, day date, pattern text,
    requested_by uuid, status text, taken_by uuid, decided_by uuid, decided_at timestamptz,
    cancelled_because text, created_at timestamptz)
join public.schedule_weeks w on w.business_id = r.business and w.starts_on = r.week_start
join public.schedule_shifts s
  on s.week_id = w.id and s.day = r.day and s.pattern_key = r.pattern
  and (r.shift is null or s.id = r.shift);
