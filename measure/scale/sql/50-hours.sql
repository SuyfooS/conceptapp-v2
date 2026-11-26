-- 50-hours: the hours, by the rules of shape.ts, so the exclusion
-- constraints always hold.
--
-- One entry per placed shift that has ended, never two on a day, and at
-- least 12 hours between two of a person's (time_entries_no_overlap treats
-- an open entry as running to infinity, so only those on the clock now are
-- open, in a shift that runs two hours more or longer). A missed punch is
-- an entry a manager closed later, its departure 'manager' with
-- edited_by and edited_at; a corrected time is 'manager' too
-- (20261108000300_sealed.sql). Entries without a code ('none') and a
-- manager's own hours ('self') are confirmed after they ended, but for the
-- ones waiting now. Breaks lie inside their entry. The days away go through
-- public.record_absence as the owner, as the team's hours screen records
-- them. The log of all this comes later, in one insert (90-log).

-- step: entries
insert into public.time_entries (
  id, business_id, user_id, clock_in, clock_out, source, in_proof, out_proof,
  confirmed_by, confirmed_at, edited_by, edited_at, note, cancelled_at, cancelled_by,
  cancel_reason, created_at
)
select r.id, r.business, r.person, r.clock_in, r.clock_out, 'punch'::public.time_entry_source,
  r.in_proof, r.out_proof, r.confirmed_by, r.confirmed_at, r.edited_by, r.edited_at, r.note,
  r.cancelled_at, r.cancelled_by, r.cancel_reason, r.clock_in
from jsonb_to_recordset($1::jsonb)
  as r (id uuid, business uuid, person uuid, clock_in timestamptz, clock_out timestamptz,
    in_proof text, out_proof text, confirmed_by uuid, confirmed_at timestamptz, edited_by uuid,
    edited_at timestamptz, note text, cancelled_at timestamptz, cancelled_by uuid,
    cancel_reason text);

-- step: breaks
insert into public.time_breaks (
  id, entry_id, business_id, user_id, started_at, ended_at, unpaid, created_at
)
select r.id, r.entry, r.business, r.person, r.started_at, r.ended_at, false, r.started_at
from jsonb_to_recordset($1::jsonb)
  as r (id uuid, entry uuid, business uuid, person uuid, started_at timestamptz,
    ended_at timestamptz);

-- step: absences
select public.record_absence(
  r.actor, r.business, r.person, r.kind, r.first_day, r.last_day, null,
  current_setting('scale.anchor')::timestamptz
)
from jsonb_to_recordset($1::jsonb)
  as r (actor uuid, business uuid, person uuid, kind text, first_day date, last_day date);
