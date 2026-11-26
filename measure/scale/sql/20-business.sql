-- 20-business: the two businesses, set up as the console sets one up.
--
-- The insert opens each one's team chat (private.open_team_chat), and
-- public.apply_template gives it the general template's modules: a business
-- of any kind, nothing in it that assumes a restaurant. Then its settings
-- (checked in TypeScript against the modules' own manifests), its
-- departments (each opens its group, private.open_department_chat), its
-- owner, and the named role "אחראי/ת משמרת" holding clock.edit, through the
-- functions the roles screen calls. Neither is a demo: nothing writes a
-- private.demo_businesses row.

-- step: businesses
insert into public.businesses (id, slug, name, timezone, created_at, updated_at)
select r.id, r.slug, r.name, 'Asia/Jerusalem', r.created_at, r.created_at
from jsonb_to_recordset($1::jsonb) as r (id uuid, slug text, name text, created_at timestamptz);

-- step: templates
select public.apply_template(r.id, 'general')
from jsonb_to_recordset($1::jsonb) as r (id uuid);

-- step: settings
update public.business_modules m
set settings = m.settings || r.settings
from jsonb_to_recordset($1::jsonb) as r (business uuid, module text, settings jsonb)
where m.business_id = r.business and m.module_key::text = r.module;

-- step: departments
insert into public.departments (id, business_id, key, name, position, created_at, updated_at)
select r.id, r.business, r.key, r.name, r.position, r.created_at, r.created_at
from jsonb_to_recordset($1::jsonb)
  as r (id uuid, business uuid, key text, name text, position smallint, created_at timestamptz);

-- step: owners
insert into public.memberships (business_id, user_id, role, active, created_at, updated_at)
select r.business, r.id, 'owner'::public.member_role, true, r.created_at, r.created_at
from jsonb_to_recordset($1::jsonb) as r (business uuid, id uuid, created_at timestamptz);

-- step: named_role
select public.create_business_role(r.owner, r.business, 'worker'::public.member_role, r.name)
from jsonb_to_recordset($1::jsonb) as r (business uuid, owner uuid, name text);

-- step: role_edits_clock
select public.set_role_permission(
  r.owner, r.business, 'worker'::public.member_role, 'clock.edit', true, br.id
)
from jsonb_to_recordset($1::jsonb) as r (business uuid, owner uuid, name text)
join public.business_roles br
  on br.business_id = r.business and br.name = r.name and br.archived_at is null;
