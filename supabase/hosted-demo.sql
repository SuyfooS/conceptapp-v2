-- A demo restaurant for conceptapp-dev, so the deployed app can be opened before
-- real sign-in exists. Runs from the "Migrate conceptapp-dev" workflow with its
-- "demo" box on. It does nothing if the restaurant is already there.
--
-- Fictional people, never sent anything. The first three are the ones the
-- passive door offers (`packages/domain/passive-sign-in.ts`); the fourth fills
-- out the team.

do $$
declare
  restaurant constant uuid := '10000000-0000-4000-b000-000000000001';
begin
  if exists (select 1 from public.businesses where id = restaurant) then
    raise notice 'The demo restaurant is already there';
    return;
  end if;

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
  from (
    values
      ('10000000-0000-4000-a000-000000000102'::uuid, 'owner@demo.conceptapp.invalid', '972500000102'),
      ('10000000-0000-4000-a000-000000000103'::uuid, 'manager@demo.conceptapp.invalid', '972500000103'),
      ('10000000-0000-4000-a000-000000000104'::uuid, 'worker@demo.conceptapp.invalid', '972500000104'),
      ('10000000-0000-4000-a000-000000000105'::uuid, 'worker2@demo.conceptapp.invalid', '972500000105')
  ) as person (id, email, phone);

  -- Profiles come from the auth trigger; add the names.
  update public.profiles set full_name = 'אורי הדגמה' where id = '10000000-0000-4000-a000-000000000102';
  update public.profiles set full_name = 'שירן הדגמה' where id = '10000000-0000-4000-a000-000000000103';
  update public.profiles set full_name = 'נועה כהן' where id = '10000000-0000-4000-a000-000000000104';
  update public.profiles set full_name = 'יואב לוי' where id = '10000000-0000-4000-a000-000000000105';

  insert into public.businesses (id, slug, name, accent, address, shabbat_city)
  values (
    restaurant, 'demo-restaurant', 'מסעדת הדגמה',
    '#2563eb', 'רחוב הדגמה 1, תל אביב', 'telAviv'
  );

  insert into public.memberships (business_id, user_id, role)
  values
    (restaurant, '10000000-0000-4000-a000-000000000102', 'owner'),
    (restaurant, '10000000-0000-4000-a000-000000000103', 'manager'),
    (restaurant, '10000000-0000-4000-a000-000000000104', 'worker'),
    (restaurant, '10000000-0000-4000-a000-000000000105', 'worker');

  -- Modules, positions, shifts and hours come from the template, as for any business.
  perform public.apply_template(restaurant, 'restaurant');
end;
$$;
