-- 90-log: the history's log, in one insert ordered by created_at, so its
-- ids follow time (the activity feed reads by id, packages/db/activity.ts).
-- It comes before the weeks the app publishes (92-weeks) and the days away
-- it records (93-absences), whose rows are the anchor's, so the feed shows
-- them first. The named role's rows (role.create, role.permission,
-- 20-business) still come before it, as a business's first: the team's
-- memberships, which the hours need, hold that role.
--
-- Every entry's arrival and departure (clock.in, clock.out), as the punch
-- wrote them; each confirmation of hours without a code or of a manager's
-- own (clock.confirm); each correction (clock.correct), its details as
-- public.correct_time_entry writes them, the punched times it replaced
-- given by shape.ts; two rows a break (clock.break_start, clock.break_end);
-- and a pay holder's visit to the pay screens on each working day
-- (payroll.view, once a day, as public.note_payroll_access writes it).
-- Never an action whose trigger tells anyone whatever the entry: the clock's
-- rows tell only while an entry waits (private.notify_for), and the ones
-- still waiting are left out here, for 95-waiting. The seed checks after
-- this part that no line moved.

-- step: history
insert into public.audit_log (business_id, actor_id, action, details, created_at)
select x.business_id, x.actor_id, x.action, x.details, x.created_at
from (
  select e.business_id, e.user_id as actor_id, 'clock.in' as action,
    jsonb_build_object('entry', e.id, 'proof', jsonb_build_object(
      'proof', case when e.in_proof = 'manager' then 'scan' else e.in_proof end
    )) as details,
    coalesce(c.from_in, e.clock_in) as created_at
  from public.time_entries e
  left join jsonb_to_recordset($1::jsonb -> 'corrections')
    as c (entry uuid, from_in timestamptz, from_out timestamptz) on c.entry = e.id
  where e.business_id in (
      select b.value::uuid from jsonb_array_elements_text($1::jsonb -> 'businesses') as b (value)
    )
    and not (e.in_proof in ('none', 'self') and e.confirmed_at is null)
  union all
  select e.business_id, e.user_id, 'clock.out',
    jsonb_build_object('entry', e.id, 'proof', jsonb_build_object(
      'proof', case when e.out_proof = 'manager' then 'scan' else e.out_proof end
    )),
    coalesce(c.from_out, e.clock_out)
  from public.time_entries e
  left join jsonb_to_recordset($1::jsonb -> 'corrections')
    as c (entry uuid, from_in timestamptz, from_out timestamptz) on c.entry = e.id
  where e.business_id in (
      select b.value::uuid from jsonb_array_elements_text($1::jsonb -> 'businesses') as b (value)
    )
    and e.clock_out is not null
    and not (e.in_proof in ('none', 'self') and e.confirmed_at is null)
    -- A missed punch has no departure of its own: a manager set it.
    and not (e.out_proof = 'manager' and e.in_proof is distinct from 'manager')
  union all
  select e.business_id, e.confirmed_by, 'clock.confirm',
    jsonb_build_object('entry', e.id, 'person', e.user_id),
    e.confirmed_at
  from public.time_entries e
  where e.business_id in (
      select b.value::uuid from jsonb_array_elements_text($1::jsonb -> 'businesses') as b (value)
    )
    and e.confirmed_at is not null
  union all
  select e.business_id, e.edited_by, 'clock.correct',
    jsonb_build_object(
      'entry', e.id,
      'person', e.user_id,
      'from', jsonb_build_object('clock_in', c.from_in, 'clock_out', c.from_out),
      'to', jsonb_build_object('clock_in', e.clock_in, 'clock_out', e.clock_out),
      'proof', jsonb_build_object('in', e.in_proof, 'out', e.out_proof),
      'note', e.note
    ),
    e.edited_at
  from jsonb_to_recordset($1::jsonb -> 'corrections')
    as c (entry uuid, from_in timestamptz, from_out timestamptz)
  join public.time_entries e on e.id = c.entry
  union all
  select b.business_id, b.user_id, 'clock.break_start',
    jsonb_build_object('entry', b.entry_id, 'break', b.id),
    b.started_at
  from public.time_breaks b
  where b.business_id in (
      select v.value::uuid from jsonb_array_elements_text($1::jsonb -> 'businesses') as v (value)
    )
  union all
  select b.business_id, b.user_id, 'clock.break_end',
    jsonb_build_object('entry', b.entry_id, 'break', b.id),
    b.ended_at
  from public.time_breaks b
  where b.business_id in (
      select v.value::uuid from jsonb_array_elements_text($1::jsonb -> 'businesses') as v (value)
    )
    and b.ended_at is not null
  union all
  select pv.business, pv.holder, 'payroll.view',
    jsonb_build_object('month', to_char(d.day, 'YYYY-MM'), 'kind', 'month'),
    (d.day + time '09:05') at time zone 'Asia/Jerusalem'
  from jsonb_to_recordset($1::jsonb -> 'views')
    as pv (business uuid, holder uuid, first_day date, last_day date)
  cross join lateral (
    select g::date as day
    from generate_series(pv.first_day::timestamp, pv.last_day::timestamp, interval '1 day') as g
  ) d
  where extract(dow from d.day) between 0 and 4
) x
order by x.created_at, x.action, x.details ->> 'entry';
