-- Local and CI seed: one demo restaurant with an owner, a shift manager and
-- a worker. Fictional business and people (the same as /design/shell).
-- Phones are in the 050-000-00xx range and are never sent anything.
-- This file runs on `supabase db reset` only; it never reaches a real project.

insert into auth.users (
  instance_id, id, aud, role, phone, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-000000000001',
   'authenticated', 'authenticated', '972500000001', now(),
   '{"provider":"phone","providers":["phone"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-000000000002',
   'authenticated', 'authenticated', '972500000002', now(),
   '{"provider":"phone","providers":["phone"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-000000000003',
   'authenticated', 'authenticated', '972500000003', now(),
   '{"provider":"phone","providers":["phone"]}', '{}', now(), now());

-- Profiles come from the auth trigger; add the names.
update public.profiles set full_name = 'אורי הדגמה' where id = '00000000-0000-4000-a000-000000000001';
update public.profiles set full_name = 'שירן הדגמה' where id = '00000000-0000-4000-a000-000000000002';
update public.profiles set full_name = 'נועה כהן' where id = '00000000-0000-4000-a000-000000000003';

insert into public.businesses (id, slug, name, accent, address, latitude, longitude)
values (
  '00000000-0000-4000-b000-000000000001', 'demo-restaurant', 'מסעדת הדגמה',
  '#2563EB', 'רחוב הדגמה 1, תל אביב', 32.0853, 34.7818
);

insert into public.memberships (business_id, user_id, role)
values
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001', 'owner'),
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002', 'manager'),
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000003', 'worker');

insert into public.business_modules (business_id, module_key)
select '00000000-0000-4000-b000-000000000001', key
from unnest(enum_range(null::public.module_key)) as key;
