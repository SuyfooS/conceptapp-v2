-- The dev SMS hook (seed.sql) stores login codes for the auth server only:
-- signed-in and anonymous users can neither read the codes nor call it.
begin;
select plan(5);

select is(
  dev.send_sms('{"user":{"phone":"972500000009"},"sms":{"otp":"123456"}}'::jsonb),
  '{}'::jsonb,
  'the hook answers the auth server with an empty object'
);
select results_eq(
  $$ select phone, code from dev.sms_codes where phone = '+972500000009' $$,
  $$ values ('+972500000009', '123456') $$,
  'the code is stored under the E.164 phone'
);
select ok(
  has_function_privilege('supabase_auth_admin', 'dev.send_sms(jsonb)', 'execute'),
  'the auth server may call the hook'
);
select ok(
  not has_function_privilege('authenticated', 'dev.send_sms(jsonb)', 'execute')
  and not has_function_privilege('anon', 'dev.send_sms(jsonb)', 'execute'),
  'users cannot call the hook'
);
select ok(
  not has_schema_privilege('authenticated', 'dev', 'usage')
  and not has_schema_privilege('anon', 'dev', 'usage'),
  'users cannot reach the dev schema, so the codes stay hidden'
);

select * from finish();
rollback;
