-- The demo businesses for conceptapp-dev, so the deployed app can be opened
-- before real sign-in exists: a restaurant and a shop. Runs from the "Migrate
-- conceptapp-dev" workflow with its "demo" box on, and is safe to run again:
-- it adds the people and businesses that are not there yet and leaves the
-- others as visitors left them. The door's reset (public.reset_demo_business)
-- puts a business back the way it is written here.
--
-- Fictional people, never sent anything. Those with a door address are the
-- ones the passive door offers (`packages/domain/passive-sign-in.ts`); the
-- others fill out the teams. The ids and phones differ from supabase/seed.sql.

do $$
begin
  create temporary table demo_people (id uuid, email text, phone text) on commit drop;
  insert into demo_people (id, email, phone)
  values
    -- The restaurant.
    ('10000000-0000-4000-a000-000000000102', 'owner@demo.conceptapp.invalid', '972500000102'),
    ('10000000-0000-4000-a000-000000000103', 'manager@demo.conceptapp.invalid', '972500000103'),
    ('10000000-0000-4000-a000-000000000104', 'worker@demo.conceptapp.invalid', '972500000104'),
    ('10000000-0000-4000-a000-000000000105', 'worker2@demo.conceptapp.invalid', '972500000105'),
    -- The shop.
    ('10000000-0000-4000-a000-000000000106', 'shop-owner@demo.conceptapp.invalid', '972500000106'),
    ('10000000-0000-4000-a000-000000000107', 'shop-manager@demo.conceptapp.invalid', '972500000107'),
    ('10000000-0000-4000-a000-000000000108', 'shop-worker@demo.conceptapp.invalid', '972500000108'),
    ('10000000-0000-4000-a000-000000000109', 'shop-worker2@demo.conceptapp.invalid', '972500000109'),
    ('10000000-0000-4000-a000-000000000110', 'shop-worker3@demo.conceptapp.invalid', '972500000110'),
    ('10000000-0000-4000-a000-000000000111', 'shop-worker4@demo.conceptapp.invalid', '972500000111');

  -- An account holding a demo address or number under another id would stop
  -- the insert below on every run. It can only be a stray demo account (one
  -- made by mistake before this file ran), so it goes.
  delete from auth.users u
  using demo_people person
  where (u.email = person.email or u.phone = person.phone)
    and u.id <> person.id;

  insert into auth.users (
    instance_id, id, aud, role, email, email_confirmed_at, phone, phone_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  )
  select
    '00000000-0000-0000-0000-000000000000', person.id, 'authenticated', 'authenticated',
    person.email, now(), person.phone, now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', '', '', '', '', ''
  from demo_people person
  on conflict (id) do nothing;

  -- How each one starts. Written again on every run, so a change here reaches
  -- the next reset. Each person names the departments they are in, by their
  -- template's keys, as supabase/seed.sql does.
  insert into private.demo_businesses (business_id, definition)
  values
    ('10000000-0000-4000-b000-000000000001', $json$
    {
      "slug": "demo-restaurant", "name": "מסעדת הדגמה", "accent": "#2563eb",
      "address": "רחוב הדגמה 1, תל אביב", "shabbat_city": "telAviv",
      "template": "restaurant", "renews": false,
      "people": [
        { "user_id": "10000000-0000-4000-a000-000000000102", "role": "owner", "name": "אורי הדגמה" },
        { "user_id": "10000000-0000-4000-a000-000000000103", "role": "manager", "name": "שירן הדגמה", "departments": ["floor", "bar"] },
        { "user_id": "10000000-0000-4000-a000-000000000104", "role": "worker", "name": "נועה כהן", "departments": ["kitchen"] },
        { "user_id": "10000000-0000-4000-a000-000000000105", "role": "worker", "name": "יואב לוי", "departments": ["bar", "storeroom"] }
      ]
    }
    $json$::jsonb),
    ('10000000-0000-4000-b000-000000000002', $json$
    {
      "slug": "demo-shop", "name": "חנות הדגמה", "accent": "#7c3aed",
      "address": "רחוב הדגמה 2, חיפה", "shabbat_city": "haifa",
      "template": "retail", "renews": true,
      "people": [
        { "user_id": "10000000-0000-4000-a000-000000000106", "role": "owner", "name": "מיכל הדגמה" },
        { "user_id": "10000000-0000-4000-a000-000000000107", "role": "manager", "name": "עומר הדגמה", "departments": ["floor"] },
        { "user_id": "10000000-0000-4000-a000-000000000108", "role": "worker", "name": "תמר אברהם", "departments": ["checkout"] },
        { "user_id": "10000000-0000-4000-a000-000000000109", "role": "worker", "name": "איתי מזרחי", "departments": ["floor"] },
        { "user_id": "10000000-0000-4000-a000-000000000110", "role": "worker", "name": "רוני שלום", "departments": ["stock"] },
        { "user_id": "10000000-0000-4000-a000-000000000111", "role": "worker", "name": "ליה כץ", "departments": ["checkout", "floor"] }
      ]
    }
    $json$::jsonb)
  on conflict (business_id) do update set definition = excluded.definition;

  -- Make the businesses that are not there yet, from their template.
  perform public.reset_demo_business(d.business_id)
  from private.demo_businesses d
  where not exists (select 1 from public.businesses b where b.id = d.business_id);
end;
$$;
