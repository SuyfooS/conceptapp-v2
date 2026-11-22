-- What each business asks of the hiring file
-- (20261126000400_employee_files_settings.sql; profile H5b): the settings are
-- an owner's and the team's alone, a manager's, a worker's, a former
-- owner's and another business's owner's refused; each value one the
-- manifest outputs, anything else refused; the other modules' branches as
-- they were; and the groups the file counts follow askAddress and askBank
-- (a stored value that isn't a boolean read as the default), in
-- private.file_missing, in the worker's own read and in what a holder may
-- mark handed directly. The helpers run for nobody but their callers.
-- Fixed ids (f5…), numbers (050-078-xxxx) and slugs (efs-…), so nothing here
-- meets the seed or another test.
begin;
select plan(22);

-- A: 1 its owner, 2 a manager (manage.edit, clock.edit and order_taking.edit
-- by default), 3 a worker, 4 an owner who left. 5 is on the ConceptApp
-- team. B: 6 its owner.
insert into auth.users (id, aud, role, phone)
select ('f5000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250078' || lpad(n::text, 4, '0')
from generate_series(1, 6) as n;

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('f5000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.a() returns uuid language sql as $$
  select 'f5000000-0000-4000-b000-000000000001'::uuid
$$;
create function pg_temp.b() returns uuid language sql as $$
  select 'f5000000-0000-4000-b000-000000000002'::uuid
$$;

insert into public.businesses (id, slug, name)
values (pg_temp.a(), 'efs-a', 'File settings A'), (pg_temp.b(), 'efs-b', 'File settings B');
insert into public.memberships (business_id, user_id, role, active)
values
  (pg_temp.a(), pg_temp.p(1), 'owner', true),
  (pg_temp.a(), pg_temp.p(2), 'manager', true),
  (pg_temp.a(), pg_temp.p(3), 'worker', true),
  (pg_temp.a(), pg_temp.p(4), 'owner', false),
  (pg_temp.b(), pg_temp.p(6), 'owner', true);
insert into public.business_modules (business_id, module_key, enabled, settings)
values
  (pg_temp.a(), 'employee_files', true, '{}'),
  (pg_temp.a(), 'time_clock', true, '{}'),
  (pg_temp.a(), 'order_taking', true, '{}'),
  (pg_temp.b(), 'employee_files', true, '{}');
insert into public.platform_staff (user_id, role) values (pg_temp.p(5), 'onboarder');

-- The worker's identity and pension in, nothing else: stand-in sealed bytes
-- for her key. The owner confirmed the duties, and real values are open
-- here, so a holder's mark reaches its check of the groups.
insert into private.person_keys (business_id, user_id, kek_id, wrapped_dek)
values (pg_temp.a(), pg_temp.p(3), 1, decode('01' || repeat('00', 60), 'hex'));
insert into public.employee_details (
  business_id, user_id, legal_first_name, legal_last_name, birth_date,
  id_kind, id_enc, id_hint, pension_answer, pension_fund, pension_answered_at
)
values (
  pg_temp.a(), pg_temp.p(3), 'Noa', 'Cohen', '1994-03-01',
  'il', decode('01' || repeat('11', 40), 'hex'), '4821', 'existing', 'unknown', now()
);
insert into private.file_acknowledgements (business_id, user_id, version)
values (pg_temp.a(), pg_temp.p(1), '2026-11-v1');
update private.file_settings set real_values = true, changed_at = now();

-- A save of the file's settings by person n in A.
create function pg_temp.save(n integer, patch text) returns text language sql as $$
  select format(
    'select public.set_module_settings(%L, %L, %L, %L)',
    pg_temp.p(n), pg_temp.a(), 'employee_files', patch
  )
$$;
-- What a call is refused with: its code, or 'none'.
create function pg_temp.refusal(call text) returns text language plpgsql as $$
declare
  got_code text;
begin
  execute call;
  return 'none';
exception when others then
  get stacked diagnostics got_code = returned_sqlstate;
  return got_code;
end;
$$;
create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function pg_temp.settings(business uuid) returns jsonb language sql as $$
  select bm.settings from public.business_modules bm
  where bm.business_id = business and bm.module_key = 'employee_files'
$$;

------------------------------------------------------------------------------
-- Who may call them

select ok(
  (
    select bool_and(
      not has_function_privilege('authenticated', f.sig, 'execute')
      and not has_function_privilege('anon', f.sig, 'execute')
    )
    from unnest(array[
      'private.employee_files_settings(uuid)', 'private.file_asks(uuid, text, boolean)',
      'private.file_setting_line(jsonb, integer)', 'private.file_setting_link(jsonb)',
      'private.file_groups(uuid)'
    ]) as f (sig)
  ),
  'the settings'' helpers run for nobody but their callers'
);
select ok(
  not has_function_privilege('authenticated',
    'public.set_module_settings(uuid, uuid, public.module_key, jsonb)', 'execute')
  and has_function_privilege('service_role',
    'public.set_module_settings(uuid, uuid, public.module_key, jsonb)', 'execute'),
  'and the settings are saved by the server alone, as before'
);

------------------------------------------------------------------------------
-- The groups, before anything is set

select is(private.file_groups(pg_temp.b()), '{identity,address,bank,pension}'::text[],
  'a business that set nothing asks every group');
select is(private.file_missing(pg_temp.a(), pg_temp.p(3)), '{address,bank}'::text[],
  'so the worker''s address and account are missing');
select pg_temp.sign_in(pg_temp.p(3));
select is(public.employee_file(pg_temp.a(), pg_temp.p(3)) -> 'missing', '["address", "bank"]'::jsonb,
  'and her own read says so');
reset role;

------------------------------------------------------------------------------
-- An owner's save, and what follows from it

select lives_ok(
  pg_temp.save(1, '{"askBank": false, "askEmergencyContact": true, "form101": "link",
    "form101Provider": "Payroll office", "form101Link": "https://101.example/a?b=1",
    "employerPhone": "+97231234567", "deductionsFile": "912345678"}'),
  'an owner sets what the file asks'
);
select is(
  pg_temp.settings(pg_temp.a()),
  '{"askBank": false, "askEmergencyContact": true, "form101": "link",
    "form101Provider": "Payroll office", "form101Link": "https://101.example/a?b=1",
    "employerPhone": "+97231234567", "deductionsFile": "912345678"}'::jsonb,
  'and it is kept as given'
);
select ok(
  exists (
    select 1 from public.audit_log l
    where l.business_id = pg_temp.a() and l.actor_id = pg_temp.p(1)
      and l.action = 'module.settings' and l.details ->> 'module' = 'employee_files'
      and l.details -> 'to' ->> 'form101Link' = 'https://101.example/a?b=1'
  ),
  'and logged, as every setting is'
);
select is(private.file_groups(pg_temp.a()), '{identity,address,pension}'::text[],
  'the account not asked, the file no longer counts it');
select is(private.file_missing(pg_temp.a(), pg_temp.p(3)), '{address}'::text[],
  'nor is it missing');
select is(
  pg_temp.refusal(format(
    'select public.set_direct_groups(%L, %L, %L, %L)',
    pg_temp.p(1), pg_temp.a(), pg_temp.p(3), '{bank}'
  )),
  '22023',
  'and a holder can''t mark it handed directly'
);

------------------------------------------------------------------------------
-- Who else may not

select is(
  concat_ws(' ',
    pg_temp.refusal(pg_temp.save(2, '{"askBank": true}')),
    pg_temp.refusal(pg_temp.save(2, '{"form101Link": "https://elsewhere.example/ids"}')),
    pg_temp.refusal(pg_temp.save(2, '{"employerPhone": "+972501234567"}'))),
  '42501 42501 42501',
  'a manager who edits the management page changes none of them'
);
select is(
  concat_ws(' ',
    pg_temp.refusal(pg_temp.save(3, '{"askBank": true}')),
    pg_temp.refusal(pg_temp.save(4, '{"askBank": true}')),
    pg_temp.refusal(pg_temp.save(6, '{"askBank": true}'))),
  '42501 42501 42501',
  'nor a worker, an owner who left, or another business''s owner'
);

------------------------------------------------------------------------------
-- Only values the manifest outputs

select is(
  concat_ws(' ',
    pg_temp.refusal(pg_temp.save(1, '{"nope": true}')),
    pg_temp.refusal(pg_temp.save(1, '{"askBank": "false"}')),
    pg_temp.refusal(pg_temp.save(1, '{"askWorkLanguage": 1}')),
    pg_temp.refusal(pg_temp.save(1, '{"form101": "paper"}')),
    pg_temp.refusal(pg_temp.save(1, '{"employerPhone": "0501234567"}')),
    pg_temp.refusal(pg_temp.save(1, '{"employerPhone": "+97212345678"}')),
    pg_temp.refusal(pg_temp.save(1, '{"deductionsFile": "812345678"}')),
    pg_temp.refusal(pg_temp.save(1, '{"deductionsFile": 912345678}'))),
  '22023 22023 22023 22023 22023 22023 22023 22023',
  'a key it doesn''t have, a boolean as text or a number, a way, a phone or a file it doesn''t take'
);
select is(
  concat_ws(' ',
    pg_temp.refusal(pg_temp.save(1, jsonb_build_object('employerName', repeat('a', 61))::text)),
    pg_temp.refusal(pg_temp.save(1, jsonb_build_object('employerName', 'Line' || chr(10) || 'two')::text)),
    pg_temp.refusal(pg_temp.save(1, '{"payrollProvider": " Spaced "}')),
    pg_temp.refusal(pg_temp.save(1, '{"form101Link": "http://x.co"}')),
    pg_temp.refusal(pg_temp.save(1, '{"form101Link": "https://"}')),
    pg_temp.refusal(pg_temp.save(1, '{"form101Link": "javascript:alert(1)"}')),
    pg_temp.refusal(pg_temp.save(1, '{"form101Link": "https://x.co/a b"}')),
    pg_temp.refusal(pg_temp.save(1, '{"form101Link": "HTTPS://X.co"}'))),
  '22023 22023 22023 22023 22023 22023 22023 22023',
  'a name too long, on two lines or with spaces around it, and a link that isn''t https to a named host'
);

------------------------------------------------------------------------------
-- The team, and both asks off

select lives_ok(pg_temp.save(5, '{"askAddress": false}'), 'the team sets what the file asks');
select is(private.file_groups(pg_temp.a()), '{identity,pension}'::text[],
  'with neither asked, the identity and the pension are counted');
select is(private.file_missing(pg_temp.a(), pg_temp.p(3)), '{}'::text[],
  'so the worker''s file is complete');
select pg_temp.sign_in(pg_temp.p(3));
select is(public.employee_file(pg_temp.a(), pg_temp.p(3)) -> 'missing', '[]'::jsonb,
  'and her own read says so');
reset role;

update public.business_modules bm set settings = '{"askBank": "false"}'
where bm.business_id = pg_temp.b() and bm.module_key = 'employee_files';
select is(private.file_groups(pg_temp.b()), '{identity,address,bank,pension}'::text[],
  'a stored ask that isn''t a boolean reads as the default');

------------------------------------------------------------------------------
-- The other modules, as they were

select is(
  pg_temp.refusal(format(
    'select public.set_module_settings(%L, %L, %L, %L)',
    pg_temp.p(2), pg_temp.a(), 'time_clock', '{"requirePunchCode": true}'
  )),
  '42501',
  'a manager still doesn''t change the punch code'
);
select is(
  pg_temp.refusal(format(
    'select public.set_module_settings(%L, %L, %L, %L)',
    pg_temp.p(2), pg_temp.a(), 'order_taking', '{"lateAfterMinutes": 20}'
  )),
  'none',
  'and still sets when an order waits too long'
);

select * from finish();
rollback;
