-- 80-lines: the bell's history, through private.notify, so every line is
-- well formed and push_state is whatever the app would give it: with no
-- device anywhere private.push_plan is null, so 'none'.
--
-- Who joined, to those who see the team (team.view), as a claim tells them;
-- and each of the last 25 weeks of history published, to the staff of the
-- time (the accountant is never told of the schedule, and private.notify
-- leaves out whoever acted). Then seven in ten of the lines made before
-- this week are read: by the seed's md5 choice of the person and the day,
-- computed here in SQL as shape.ts computes it, so the count read is known
-- before it is written.

-- step: joined
select private.notify(
  business => r.business,
  recipients => array(select jsonb_array_elements_text(r.recipients))::uuid[],
  what => 'team.joined',
  facts => jsonb_build_object('person', r.person),
  actor => r.person,
  audience => 'manager'::public.member_role,
  dedupe => 'team.joined:' || r.person,
  at_time => r.joined_at,
  holders_of => 'team.view'
)
from jsonb_to_recordset($1::jsonb)
  as r (business uuid, person uuid, recipients jsonb, joined_at timestamptz);

-- step: published
select private.notify(
  business => r.business,
  recipients => array[r.person],
  what => 'schedule.published',
  facts => jsonb_build_object('week', r.week, 'startsOn', r.starts_on, 'mine', r.mine),
  actor => r.actor,
  about => 'scheduling'::public.module_key,
  audience => 'worker'::public.member_role,
  dedupe => 'schedule:' || r.week,
  at_time => r.published_at
)
from jsonb_to_recordset($1::jsonb)
  as r (business uuid, person uuid, week uuid, starts_on date, mine integer, actor uuid,
    published_at timestamptz);

-- step: read
update public.notifications n
set read_at = n.created_at + interval '3 hours'
where n.business_id in (select b.value::uuid from jsonb_array_elements_text($1::jsonb) as b (value))
  and n.kind in ('team.joined', 'schedule.published')
  and n.read_at is null
  and n.created_at < current_setting('scale.week_start')::timestamptz
  and ('x' || substr(md5(
    current_setting('scale.version') || ':read:' || n.user_id::text || ':'
      || to_char(n.created_at at time zone 'Asia/Jerusalem', 'YYYY-MM-DD')
  ), 1, 8))::bit(32)::bigint / 4294967296.0 < 0.7;
