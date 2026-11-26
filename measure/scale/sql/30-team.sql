-- 30-team: everyone's place in the business, backdated, and what comes with it.
--
-- One insert of the memberships with their created_at set: on insert,
-- memberships_staff_since makes staff_since that moment
-- (20261111000200_chat.sql), and memberships_track_employment opens a
-- 'joined' period on its day (20261110000600_payroll_details.sql). Those who
-- left go in inactive, so no period opens; theirs are written with the day
-- they left, as an update would end one today. The business's own names go
-- in after the memberships (their key is the membership's) and never for an
-- owner. Department members are backdated to the day they joined. Wages,
-- payroll details and the seeded invites, at fictional numbers, last.

-- step: memberships
insert into public.memberships (
  business_id, user_id, role, named_role, active, left_at, created_at, updated_at
)
select r.business, r.id, r.role::public.member_role,
  case when r.lead then br.id end,
  r.active, r.left_at, r.created_at, coalesce(r.left_at, r.created_at)
from jsonb_to_recordset($1::jsonb)
  as r (business uuid, id uuid, role text, lead boolean, lead_role text, active boolean,
    left_at timestamptz, created_at timestamptz)
left join public.business_roles br
  on br.business_id = r.business and br.name = r.lead_role and br.archived_at is null;

-- step: member_names
insert into public.member_names (business_id, user_id, name, updated_at)
select r.business, r.id, r.name, r.stamp
from jsonb_to_recordset($1::jsonb) as r (business uuid, id uuid, name text, stamp timestamptz);

-- step: department_members
insert into public.department_members (department_id, business_id, user_id, added_at)
select r.department, r.business, r.id, r.stamp
from jsonb_to_recordset($1::jsonb)
  as r (department uuid, business uuid, id uuid, stamp timestamptz);

-- step: periods
insert into public.employment_periods (
  id, business_id, user_id, started_on, ended_on, source, updated_at
)
select r.id, r.business, r.person, r.started_on, r.ended_on, 'joined', r.stamp
from jsonb_to_recordset($1::jsonb)
  as r (id uuid, business uuid, person uuid, started_on date, ended_on date, stamp timestamptz);

-- step: wages
insert into public.member_wages (
  id, business_id, user_id, hourly_agorot, effective_from, note, set_by, set_at
)
select r.id, r.business, r.person, r.agorot, r.effective_from, null, r.set_by, r.set_at
from jsonb_to_recordset($1::jsonb)
  as r (id uuid, business uuid, person uuid, agorot integer, effective_from date,
    set_by uuid, set_at timestamptz);

-- step: payroll_details
insert into public.member_payroll_details (business_id, user_id, payroll_number, updated_by)
select r.business, r.person, r.payroll_number, r.updated_by
from jsonb_to_recordset($1::jsonb)
  as r (business uuid, person uuid, payroll_number text, updated_by uuid);

-- step: invites
insert into public.invites (
  id, business_id, phone, role, full_name, token_hash, invited_by, created_at, expires_at
)
select r.id, r.business, r.phone, 'worker'::public.member_role, r.name, r.token_hash,
  r.invited_by, r.created_at, r.expires_at
from jsonb_to_recordset($1::jsonb)
  as r (id uuid, business uuid, phone text, name text, token_hash text, invited_by uuid,
    created_at timestamptz, expires_at timestamptz);
