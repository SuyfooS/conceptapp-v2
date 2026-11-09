-- Local and CI seed: two demo businesses and two people on the ConceptApp team
-- (a platform admin and an onboarder, in no business). Each Playwright spec
-- signs in with its own number, so the SMS resend cooldown never trips between
-- specs.
--   the restaurant  an owner, a shift manager and two workers (the same as
--                   /design/shell). Its schedule is the visitor's to build.
--   the shop        an owner, a manager and four workers, with this week's
--                   schedule always published.
-- Fictional businesses and people. Phones are in the 050-000-00xx range and
-- are never sent anything. This file runs on `supabase db reset` only; it
-- never reaches a real project (supabase/hosted-demo.sql is the hosted twin).

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
   '{"provider":"phone","providers":["phone"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-000000000005',
   'authenticated', 'authenticated', '972500000005', now(),
   '{"provider":"phone","providers":["phone"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-000000000006',
   'authenticated', 'authenticated', '972500000006', now(),
   '{"provider":"phone","providers":["phone"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-000000000007',
   'authenticated', 'authenticated', '972500000007', now(),
   '{"provider":"phone","providers":["phone"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-000000000008',
   'authenticated', 'authenticated', '972500000008', now(),
   '{"provider":"phone","providers":["phone"]}', '{}', now(), now()),
  -- 009 is skipped: dev_sms.test.sql stores a code for that number.
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-000000000010',
   'authenticated', 'authenticated', '972500000010', now(),
   '{"provider":"phone","providers":["phone"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-000000000011',
   'authenticated', 'authenticated', '972500000011', now(),
   '{"provider":"phone","providers":["phone"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-000000000012',
   'authenticated', 'authenticated', '972500000012', now(),
   '{"provider":"phone","providers":["phone"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-000000000013',
   'authenticated', 'authenticated', '972500000013', now(),
   '{"provider":"phone","providers":["phone"]}', '{}', now(), now());

-- The auth server reads these token columns as strings and fails on NULL,
-- so seeded users need them empty, as real sign-ups leave them.
update auth.users
set confirmation_token = '', recovery_token = '', email_change = '',
  email_change_token_new = '', email_change_token_current = '',
  phone_change = '', phone_change_token = '', reauthentication_token = ''
where id::text like '00000000-0000-4000-a000-%';

-- The people the passive door offers (packages/domain/passive-sign-in.ts).
update auth.users set email = 'owner@demo.conceptapp.invalid', email_confirmed_at = now()
where id = '00000000-0000-4000-a000-000000000001';
update auth.users set email = 'manager@demo.conceptapp.invalid', email_confirmed_at = now()
where id = '00000000-0000-4000-a000-000000000002';
update auth.users set email = 'worker@demo.conceptapp.invalid', email_confirmed_at = now()
where id = '00000000-0000-4000-a000-000000000003';
update auth.users set email = 'shop-owner@demo.conceptapp.invalid', email_confirmed_at = now()
where id = '00000000-0000-4000-a000-000000000007';
update auth.users set email = 'shop-manager@demo.conceptapp.invalid', email_confirmed_at = now()
where id = '00000000-0000-4000-a000-000000000008';
update auth.users set email = 'shop-worker@demo.conceptapp.invalid', email_confirmed_at = now()
where id = '00000000-0000-4000-a000-000000000010';

-- Profiles come from the auth trigger. The team's names are set here; the
-- demo people's come with their business, below.
update public.profiles set full_name = 'דנה צוות' where id = '00000000-0000-4000-a000-000000000005';
update public.profiles set full_name = 'רון צוות' where id = '00000000-0000-4000-a000-000000000006';

insert into public.platform_staff (user_id, role)
values
  ('00000000-0000-4000-a000-000000000005', 'platform_admin'),
  ('00000000-0000-4000-a000-000000000006', 'onboarder');

-- How each demo business starts. The reset makes it from this: details,
-- people and everything else from its template, the way every real business
-- starts. The door's reset puts it back the same way. Unlike the hosted ones
-- (supabase/hosted-demo.sql), these take invites ("invites": true), so the
-- browser tests can invite people and join them. The restaurant also lets its
-- people set a photo and, from H2, write about themselves ("profiles": true);
-- the shop keeps them as they are, like the hosted ones.
insert into private.demo_businesses (business_id, definition)
values
  ('00000000-0000-4000-b000-000000000001', $json$
  {
    "slug": "demo-restaurant", "name": "מסעדת הדגמה", "accent": "#2563eb",
    "address": "רחוב הדגמה 1, תל אביב", "shabbat_city": "telAviv",
    "template": "restaurant", "renews": false, "invites": true, "profiles": true,
    "people": [
      { "user_id": "00000000-0000-4000-a000-000000000001", "role": "owner", "name": "אורי הדגמה" },
      { "user_id": "00000000-0000-4000-a000-000000000002", "role": "manager", "name": "שירן הדגמה" },
      { "user_id": "00000000-0000-4000-a000-000000000003", "role": "worker", "name": "נועה כהן" },
      { "user_id": "00000000-0000-4000-a000-000000000004", "role": "worker", "name": "יואב לוי" }
    ]
  }
  $json$::jsonb),
  ('00000000-0000-4000-b000-000000000002', $json$
  {
    "slug": "demo-shop", "name": "חנות הדגמה", "accent": "#7c3aed",
    "address": "רחוב הדגמה 2, חיפה", "shabbat_city": "haifa",
    "template": "retail", "renews": true, "invites": true,
    "people": [
      { "user_id": "00000000-0000-4000-a000-000000000007", "role": "owner", "name": "מיכל הדגמה" },
      { "user_id": "00000000-0000-4000-a000-000000000008", "role": "manager", "name": "עומר הדגמה" },
      { "user_id": "00000000-0000-4000-a000-000000000010", "role": "worker", "name": "תמר אברהם" },
      { "user_id": "00000000-0000-4000-a000-000000000011", "role": "worker", "name": "איתי מזרחי" },
      { "user_id": "00000000-0000-4000-a000-000000000012", "role": "worker", "name": "רוני שלום" },
      { "user_id": "00000000-0000-4000-a000-000000000013", "role": "worker", "name": "ליה כץ" }
    ]
  }
  $json$::jsonb);

select public.reset_demo_business('00000000-0000-4000-b000-000000000001');
select public.reset_demo_business('00000000-0000-4000-b000-000000000002');

-- The browser tests sign the same people in many times from one machine, so
-- the limits on sign-in codes (private.auth_limits) are lifted here.
update private.auth_limits set max_count = 100000;

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

-- The minute job and the daily one (20261109000500_push.sql) stay off here,
-- or they would send and clean at real time under the tests, which call what
-- the jobs run themselves, at times they choose. A hosted project keeps both.
select cron.alter_job(j.jobid, active => false)
from cron.job j
where j.jobname in ('notifications', 'notifications-clean');
