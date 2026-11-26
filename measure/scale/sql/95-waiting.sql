-- 95-waiting: the log rows of the entries still waiting for confirmation,
-- after the history's, so their lines are written by the log's own trigger
-- exactly as the app's punches write them.
--
-- An arrival without a code tells everyone who edits the clock (clock.edit,
-- private.members_holding) but the person; a manager's own hours ('self')
-- tell the owners alone (20261117000200_cancelled_shifts.sql). A departure
-- that waits too tells again under the same key, so it is still one line a
-- person an entry. The seed checks the count against shape.ts.

-- step: waiting
insert into public.audit_log (business_id, actor_id, action, details, created_at)
select x.business_id, x.actor_id, x.action, x.details, x.created_at
from (
  select e.business_id, e.user_id as actor_id, 'clock.in' as action,
    jsonb_build_object('entry', e.id, 'proof', jsonb_build_object('proof', e.in_proof)) as details,
    e.clock_in as created_at
  from public.time_entries e
  where e.business_id in (select b.value::uuid from jsonb_array_elements_text($1::jsonb) as b (value))
    and e.in_proof in ('none', 'self')
    and e.confirmed_at is null
  union all
  select e.business_id, e.user_id, 'clock.out',
    jsonb_build_object('entry', e.id, 'proof', jsonb_build_object('proof', e.out_proof)),
    e.clock_out
  from public.time_entries e
  where e.business_id in (select b.value::uuid from jsonb_array_elements_text($1::jsonb) as b (value))
    and e.in_proof in ('none', 'self')
    and e.confirmed_at is null
    and e.clock_out is not null
    and e.out_proof in ('none', 'self')
) x
order by x.created_at, x.action, x.details ->> 'entry';
