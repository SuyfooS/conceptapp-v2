-- A demo restaurant for conceptapp-dev, so the deployed app can be opened before
-- there is a real business. Paste it once into the project's SQL editor, after
-- the migrations and the test numbers (see "Hosted project" in README.md). It
-- stops with an error if it already ran, and changes nothing then.
--
-- Fictional people and numbers, never sent anything. They sign in with the test
-- numbers set in the dashboard, so no code here is a secret and none is written
-- down. Accounts are only ever created like this or through invites.
--
--   050-000-0101  a ConceptApp platform admin, in no business
--   050-000-0102  the restaurant's owner
--   050-000-0103  its shift manager
--   050-000-0104  a worker

begin;

insert into auth.users (
  instance_id, id, aud, role, phone, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
select
  '00000000-0000-0000-0000-000000000000', person.id, 'authenticated', 'authenticated',
  person.phone, now(), '{"provider":"phone","providers":["phone"]}', '{}', now(), now(),
  '', '', '', '', '', '', '', ''
from (
  values
    ('10000000-0000-4000-a000-000000000101'::uuid, '972500000101'),
    ('10000000-0000-4000-a000-000000000102'::uuid, '972500000102'),
    ('10000000-0000-4000-a000-000000000103'::uuid, '972500000103'),
    ('10000000-0000-4000-a000-000000000104'::uuid, '972500000104')
) as person (id, phone);

-- Profiles come from the auth trigger; add the names.
update public.profiles set full_name = 'רון צוות' where id = '10000000-0000-4000-a000-000000000101';
update public.profiles set full_name = 'אורי הדגמה' where id = '10000000-0000-4000-a000-000000000102';
update public.profiles set full_name = 'שירן הדגמה' where id = '10000000-0000-4000-a000-000000000103';
update public.profiles set full_name = 'נועה כהן' where id = '10000000-0000-4000-a000-000000000104';

insert into public.platform_staff (user_id, role)
values ('10000000-0000-4000-a000-000000000101', 'platform_admin');

insert into public.businesses (id, slug, name, accent, address, latitude, longitude)
values (
  '10000000-0000-4000-b000-000000000001', 'demo-restaurant', 'מסעדת הדגמה',
  '#2563EB', 'רחוב הדגמה 1, תל אביב', 32.0853, 34.7818
);

insert into public.memberships (business_id, user_id, role)
values
  ('10000000-0000-4000-b000-000000000001', '10000000-0000-4000-a000-000000000102', 'owner'),
  ('10000000-0000-4000-b000-000000000001', '10000000-0000-4000-a000-000000000103', 'manager'),
  ('10000000-0000-4000-b000-000000000001', '10000000-0000-4000-a000-000000000104', 'worker');

-- Modules, positions, shifts and hours come from the template, as for any business.
select public.apply_template('10000000-0000-4000-b000-000000000001', 'restaurant');

commit;
