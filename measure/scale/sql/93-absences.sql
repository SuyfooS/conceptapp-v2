-- 93-absences: this month's days away, through public.record_absence as the
-- owner, as the team's hours screen records them.
--
-- After the history's log (90-log), like the weeks the app publishes
-- (92-weeks): each writes its clock.absence_add row at the anchor, and the
-- activity feed reads by id, so these come after every row of the history.

-- step: absences
select public.record_absence(
  r.actor, r.business, r.person, r.kind, r.first_day, r.last_day, null,
  current_setting('scale.anchor')::timestamptz
)
from jsonb_to_recordset($1::jsonb)
  as r (actor uuid, business uuid, person uuid, kind text, first_day date, last_day date);
