-- Local and CI seed: one demo restaurant with an owner, a shift manager and
-- two workers (each Playwright spec signs in with its own number, so the
-- SMS resend cooldown never trips between specs). Fictional business and people (the same as /design/shell).
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
   '{"provider":"phone","providers":["phone"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-000000000004',
   'authenticated', 'authenticated', '972500000004', now(),
   '{"provider":"phone","providers":["phone"]}', '{}', now(), now());

-- The auth server reads these token columns as strings and fails on NULL,
-- so seeded users need them empty, as real sign-ups leave them.
update auth.users
set confirmation_token = '', recovery_token = '', email_change = '',
  email_change_token_new = '', email_change_token_current = '',
  phone_change = '', phone_change_token = '', reauthentication_token = ''
where id::text like '00000000-0000-4000-a000-%';

-- Profiles come from the auth trigger; add the names.
update public.profiles set full_name = 'אורי הדגמה' where id = '00000000-0000-4000-a000-000000000001';
update public.profiles set full_name = 'שירן הדגמה' where id = '00000000-0000-4000-a000-000000000002';
update public.profiles set full_name = 'נועה כהן' where id = '00000000-0000-4000-a000-000000000003';
update public.profiles set full_name = 'יואב לוי' where id = '00000000-0000-4000-a000-000000000004';

insert into public.businesses (id, slug, name, accent, address, latitude, longitude)
values (
  '00000000-0000-4000-b000-000000000001', 'demo-restaurant', 'מסעדת הדגמה',
  '#2563EB', 'רחוב הדגמה 1, תל אביב', 32.0853, 34.7818
);

insert into public.memberships (business_id, user_id, role)
values
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001', 'owner'),
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002', 'manager'),
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000003', 'worker'),
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000004', 'worker');

-- Modules, positions, shifts and hours come from the restaurant template,
-- the way every real business starts.
select public.apply_template('00000000-0000-4000-b000-000000000001', 'restaurant');

-- Dev-only SMS: the auth `send_sms` hook (supabase/config.toml) writes each
-- login code here instead of sending it, so local sign-in and the Playwright
-- test can read it. Lives in seed.sql so it can never reach a real project.
create schema if not exists dev;

create table dev.sms_codes (
  id bigint generated always as identity primary key,
  phone text not null,
  code text not null,
  created_at timestamptz not null default now()
);

create function dev.send_sms(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into dev.sms_codes (phone, code)
  values (
    '+' || ltrim(event #>> '{user,phone}', '+'),
    event #>> '{sms,otp}'
  );
  return '{}'::jsonb;
end;
$$;

revoke all on schema dev from public, anon, authenticated;
revoke all on all tables in schema dev from public, anon, authenticated;
revoke execute on function dev.send_sms(jsonb) from public, anon, authenticated;
grant usage on schema dev to supabase_auth_admin;
grant execute on function dev.send_sms(jsonb) to supabase_auth_admin;
