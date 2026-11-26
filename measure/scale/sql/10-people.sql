-- 10-people: logins, their names and fictional numbers, and the console's admin.
--
-- Logins by email at scale.conceptapp.invalid, confirmed, with no phone and
-- no password, the token columns '' as supabase/hosted-demo.sql writes them.
-- The auth server has nobody to text: a number lives on the profile alone,
-- and numbers flow from auth.users to profiles, never back
-- (20261127000600_profile_phone.sql). public.handle_new_user makes each
-- profile; its name, address form and number are set after.

-- step: logins
insert into auth.users (
  instance_id, id, aud, role, email, email_confirmed_at, phone, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
select '00000000-0000-0000-0000-000000000000', r.id, 'authenticated', 'authenticated',
  r.email, r.created_at, null, null,
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, r.created_at, r.created_at,
  '', '', '', '', '', '', '', ''
from jsonb_to_recordset($1::jsonb) as r (id uuid, email text, created_at timestamptz);

-- step: profiles
update public.profiles p
set full_name = r.name, address_form = r.address_form, phone = r.phone
from jsonb_to_recordset($1::jsonb) as r (id uuid, name text, address_form text, phone text)
where p.id = r.id;

-- step: platform
insert into public.platform_staff (user_id, role, created_at)
select r.id, 'platform_admin'::public.platform_role, r.created_at
from jsonb_to_recordset($1::jsonb) as r (id uuid, created_at timestamptz);
