-- The demo businesses for conceptapp-dev, so the deployed app can be opened
-- before real sign-in exists: a restaurant and a shop. Runs from the "Migrate
-- conceptapp-dev" workflow with its "demo" box on, and is safe to run again:
-- it adds the people and businesses that are not there yet, starts again a
-- business that someone written here is missing from, and leaves the others
-- as visitors left them. The door's reset (public.reset_demo_business) puts a
-- business back the way it is written here.
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
    ('10000000-0000-4000-a000-000000000111', 'shop-worker4@demo.conceptapp.invalid', '972500000111'),
    ('10000000-0000-4000-a000-000000000112', 'accountant@demo.conceptapp.invalid', '972500000112');

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
  -- template's keys, as supabase/seed.sql does. The shop's managers hold pay
  -- access, as there, and the shop has its accountant. Both start with last
  -- month's hours, the wages from the first of last month and the details for
  -- payroll, with the same cases as there, and both show the pay estimate.
  insert into private.demo_businesses (business_id, definition)
  values
    ('10000000-0000-4000-b000-000000000001', $json$
    {
      "slug": "demo-restaurant", "name": "מסעדת הדגמה", "accent": "#2563eb",
      "address": "רחוב הדגמה 1, תל אביב", "shabbat_city": "telAviv",
      "template": "restaurant", "renews": false,
      "settings": { "time_clock": { "payEstimate": true } },
      "hours": { "fridays": false, "cases": [
        { "user_id": "10000000-0000-4000-a000-000000000105", "case": "night" }
      ] },
      "wages": { "manager": 4500, "worker": 3800, "cases": [
        { "user_id": "10000000-0000-4000-a000-000000000105", "case": "none" }
      ] },
      "details": { "since": "2026-03-01", "numbers": 101, "cases": [] },
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
      "settings": { "time_clock": { "payEstimate": true } },
      "rolePermissions": [{ "role": "manager", "perm": "clock.payroll" }],
      "hours": { "fridays": true, "cases": [
        { "user_id": "10000000-0000-4000-a000-000000000108", "case": "friday_late" },
        { "user_id": "10000000-0000-4000-a000-000000000108", "case": "corrected", "note": "שכחה לצאת" },
        { "user_id": "10000000-0000-4000-a000-000000000109", "case": "saturday_night" },
        { "user_id": "10000000-0000-4000-a000-000000000109", "case": "without_code" },
        { "user_id": "10000000-0000-4000-a000-000000000111", "case": "evening" }
      ] },
      "wages": { "manager": 4500, "worker": 3800, "cases": [
        { "user_id": "10000000-0000-4000-a000-000000000110", "case": "raise", "agorot": 3600 }
      ] },
      "details": { "since": "2026-03-01", "numbers": 101, "cases": [
        { "user_id": "10000000-0000-4000-a000-000000000111", "case": "youth" },
        { "user_id": "10000000-0000-4000-a000-000000000111", "case": "no_number" },
        { "user_id": "10000000-0000-4000-a000-000000000110", "case": "rest_friday" },
        { "user_id": "10000000-0000-4000-a000-000000000109", "case": "started" }
      ] },
      "people": [
        { "user_id": "10000000-0000-4000-a000-000000000106", "role": "owner", "name": "מיכל הדגמה" },
        { "user_id": "10000000-0000-4000-a000-000000000107", "role": "manager", "name": "עומר הדגמה", "departments": ["floor"] },
        { "user_id": "10000000-0000-4000-a000-000000000108", "role": "worker", "name": "תמר אברהם", "departments": ["checkout"] },
        { "user_id": "10000000-0000-4000-a000-000000000109", "role": "worker", "name": "איתי מזרחי", "departments": ["floor"] },
        { "user_id": "10000000-0000-4000-a000-000000000110", "role": "worker", "name": "רוני שלום", "departments": ["stock"] },
        { "user_id": "10000000-0000-4000-a000-000000000111", "role": "worker", "name": "ליה כץ", "departments": ["checkout", "floor"] },
        { "user_id": "10000000-0000-4000-a000-000000000112", "role": "accountant", "name": "גלית הדגמה" }
      ]
    }
    $json$::jsonb)
  on conflict (business_id) do update set definition = excluded.definition;

  -- Make the businesses that are not there yet, from their template. A
  -- business that is there starts again too when someone its definition names
  -- has an account but no place in it: the reset leaves out a person without
  -- an account, so a person added to a definition by a migration (the shop's
  -- accountant, 20261110000400_payroll_screens.sql) joins only once their
  -- account is made above. After that they have their place, and the business
  -- stays as visitors left it.
  perform public.reset_demo_business(d.business_id)
  from private.demo_businesses d
  where not exists (select 1 from public.businesses b where b.id = d.business_id)
    or exists (
      select 1
      from jsonb_to_recordset(d.definition -> 'people') as person (user_id uuid)
      join public.profiles p on p.id = person.user_id
      where not exists (
        select 1 from public.memberships m
        where m.business_id = d.business_id and m.user_id = person.user_id
      )
    );
end;
$$;
