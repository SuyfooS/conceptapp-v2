-- Documents on screen (C7 of the chat plan, 20261111000800_documents_screens.sql):
-- the office's notice that the business keeps its own copy of its official
-- documents (public.document_notices, public.see_documents_notice) is kept
-- once, for someone in the office (an owner, an accountant, a pay holder)
-- with documents on, by the server alone, and read by its own person alone:
-- never by a manager without pay access, a worker, someone outside the
-- business or the ConceptApp team viewing it. Fixed ids of its own.
begin;
select plan(15);

insert into auth.users (id, aud, role, phone)
values
  ('8c000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500004701'),
  ('8c000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500004702'),
  ('8c000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', '972500004703'),
  ('8c000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', '972500004704'),
  ('8c000000-0000-4000-a000-000000000005', 'authenticated', 'authenticated', '972500004705'),
  ('8c000000-0000-4000-a000-000000000006', 'authenticated', 'authenticated', '972500004706'),
  ('8c000000-0000-4000-a000-000000000007', 'authenticated', 'authenticated', '972500004707');

-- 1 the owner, 2 a manager without pay access, 3 a worker, 4 the accountant,
-- 5 a manager given pay access; 6 in no business; 7 on the ConceptApp team,
-- viewing the business as an accountant.
insert into public.businesses (id, slug, name)
values ('8c000000-0000-4000-b000-000000000001', 'documents-screens', 'Documents screens');

insert into public.memberships (business_id, user_id, role, active, perms)
values
  ('8c000000-0000-4000-b000-000000000001', '8c000000-0000-4000-a000-000000000001', 'owner', true, '{}'),
  ('8c000000-0000-4000-b000-000000000001', '8c000000-0000-4000-a000-000000000002', 'manager', true, '{}'),
  ('8c000000-0000-4000-b000-000000000001', '8c000000-0000-4000-a000-000000000003', 'worker', true, '{}'),
  ('8c000000-0000-4000-b000-000000000001', '8c000000-0000-4000-a000-000000000004', 'accountant', true, '{}'),
  ('8c000000-0000-4000-b000-000000000001', '8c000000-0000-4000-a000-000000000005', 'manager', true,
   '{clock.payroll}');

insert into public.business_modules (business_id, module_key, enabled, settings)
values ('8c000000-0000-4000-b000-000000000001', 'chat', true, '{}');

insert into public.platform_staff (user_id, role)
values ('8c000000-0000-4000-a000-000000000007', 'onboarder');
insert into public.view_sessions (staff_id, business_id, role)
values ('8c000000-0000-4000-a000-000000000007', '8c000000-0000-4000-b000-000000000001', 'accountant');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

------------------------------------------------------------------------------
-- Who may

select ok(
  has_table_privilege('authenticated', 'public.document_notices', 'select')
  and not has_table_privilege('authenticated', 'public.document_notices', 'insert, update, delete')
  and not has_table_privilege('anon', 'public.document_notices', 'select, insert, update, delete')
  and not has_table_privilege('service_role', 'public.document_notices', 'select, insert, update, delete'),
  'the browser reads the notices and writes none, and the server role reads none'
);
select ok(
  has_function_privilege('service_role', 'public.see_documents_notice(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.see_documents_notice(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.see_documents_notice(uuid, uuid)', 'execute'),
  'only the server marks the notice read'
);

------------------------------------------------------------------------------
-- Reading it

select lives_ok(
  $$select public.see_documents_notice('8c000000-0000-4000-a000-000000000001',
    '8c000000-0000-4000-b000-000000000001')$$,
  'the owner reads the notice'
);
update public.document_notices set seen_at = '2026-11-01 08:00+00'
where business_id = '8c000000-0000-4000-b000-000000000001'
  and user_id = '8c000000-0000-4000-a000-000000000001';
select public.see_documents_notice('8c000000-0000-4000-a000-000000000001',
  '8c000000-0000-4000-b000-000000000001');
select is(
  (select n.seen_at from public.document_notices n
   where n.business_id = '8c000000-0000-4000-b000-000000000001'
     and n.user_id = '8c000000-0000-4000-a000-000000000001'),
  '2026-11-01 08:00+00'::timestamptz,
  'once: reading it again keeps the first time'
);
select lives_ok(
  $$select public.see_documents_notice('8c000000-0000-4000-a000-000000000004',
    '8c000000-0000-4000-b000-000000000001')$$,
  'so does the accountant, who is off the staff and in the office'
);
select lives_ok(
  $$select public.see_documents_notice('8c000000-0000-4000-a000-000000000005',
    '8c000000-0000-4000-b000-000000000001')$$,
  'and a manager given pay access'
);
select throws_ok(
  $$select public.see_documents_notice('8c000000-0000-4000-a000-000000000002',
    '8c000000-0000-4000-b000-000000000001')$$,
  '42501', null, 'a manager without pay access, who is not in the office, is refused'
);
select throws_ok(
  $$select public.see_documents_notice('8c000000-0000-4000-a000-000000000003',
    '8c000000-0000-4000-b000-000000000001')$$,
  '42501', null, 'and so is a worker'
);
select throws_ok(
  $$select public.see_documents_notice('8c000000-0000-4000-a000-000000000006',
    '8c000000-0000-4000-b000-000000000001')$$,
  '42501', null, 'and someone not in the business'
);
update public.business_modules set enabled = false
where business_id = '8c000000-0000-4000-b000-000000000001' and module_key = 'chat';
select throws_ok(
  $$select public.see_documents_notice('8c000000-0000-4000-a000-000000000001',
    '8c000000-0000-4000-b000-000000000001')$$,
  '55000', null, 'and anyone while documents are off'
);
update public.business_modules set enabled = true
where business_id = '8c000000-0000-4000-b000-000000000001' and module_key = 'chat';
select is(
  (select count(*)::integer from public.audit_log a
   where a.business_id = '8c000000-0000-4000-b000-000000000001'
     and a.action ~ '^document'),
  0,
  'reading it writes no row of the log'
);

------------------------------------------------------------------------------
-- Who reads it

select pg_temp.sign_in('8c000000-0000-4000-a000-000000000001');
select results_eq(
  'select user_id from public.document_notices',
  $$values ('8c000000-0000-4000-a000-000000000001'::uuid)$$,
  'each person reads their own notice'
);
select pg_temp.sign_in('8c000000-0000-4000-a000-000000000004');
select results_eq(
  'select user_id from public.document_notices',
  $$values ('8c000000-0000-4000-a000-000000000004'::uuid)$$,
  'and nobody else''s, the accountant neither'
);
select pg_temp.sign_in('8c000000-0000-4000-a000-000000000002');
select is_empty(
  'select 1 from public.document_notices',
  'the manager without pay access reads no row'
);
select pg_temp.sign_in('8c000000-0000-4000-a000-000000000007');
select is_empty(
  'select 1 from public.document_notices',
  'and the ConceptApp team viewing the business as an accountant reads none'
);
reset role;

select * from finish();
rollback;
