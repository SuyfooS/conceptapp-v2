-- The hiring file, who reads it (20261126000200_employee_files.sql; profile
-- H4): nobody selects its tables, the secret key included; every function
-- is security definer with an empty search_path, the writes for the secret
-- key and the reads for a session; the key people.files, which owners and
-- accountants hold; who reads a file (the person, also after leaving and
-- unlogged; a holder who confirmed the duties, logged once a day; a manager
-- once given the key by role or personally, and no more once removed), and
-- every refusal returned and logged (a view as any role, someone outside
-- the business, which names no more, the cap of 20 a day and its "many",
-- none for a stranger's ids, none signed out, none with the module off);
-- the two numbers revealed one call at a time, at most 30 people an hour,
-- counted under the holder's lock;
-- the export, with an unconfirmed account held back; the status, details
-- for holders and a count for the team; the emergency contacts; the log's
-- rows by who holds the files; and no row holding a value. Fixed ids (f1…),
-- numbers (050-074-xxxx) and slugs (ef-…), so nothing here meets the seed
-- or another test. The files are written straight into the tables here
-- (their writes are employee_files_writes.test.sql's), with stand-in bytes.
begin;
select plan(76);

-- A: 1 its owner, 2 a manager, 3 Noa and 4 Yoav, workers, 5 the accountant,
-- 6 a worker who left, 12 a manager given the files, 101 to 131 workers. B:
-- 7 its owner, the module off. 8, 9 and 10 are on the ConceptApp team,
-- viewing A as an owner, a manager and an accountant; 11 is on the team,
-- viewing nothing.
insert into auth.users (id, aud, role, phone)
select ('f1000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250074' || lpad(n::text, 4, '0')
from (select generate_series(1, 12) union all select generate_series(101, 131)) as s (n);

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('f1000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.a() returns uuid language sql as $$
  select 'f1000000-0000-4000-b000-000000000001'::uuid
$$;
create function pg_temp.b() returns uuid language sql as $$
  select 'f1000000-0000-4000-b000-000000000002'::uuid
$$;

insert into public.businesses (id, slug, name)
values (pg_temp.a(), 'ef-a', 'Files A'), (pg_temp.b(), 'ef-b', 'Files B');
insert into public.memberships (business_id, user_id, role, active)
values
  (pg_temp.a(), pg_temp.p(1), 'owner', true),
  (pg_temp.a(), pg_temp.p(2), 'manager', true),
  (pg_temp.a(), pg_temp.p(3), 'worker', true),
  (pg_temp.a(), pg_temp.p(4), 'worker', true),
  (pg_temp.a(), pg_temp.p(5), 'accountant', true),
  (pg_temp.a(), pg_temp.p(6), 'worker', false),
  (pg_temp.a(), pg_temp.p(12), 'manager', true),
  (pg_temp.b(), pg_temp.p(7), 'owner', true);
insert into public.memberships (business_id, user_id, role, active)
select pg_temp.a(), pg_temp.p(n), 'worker', true from generate_series(101, 131) as n;
insert into public.business_modules (business_id, module_key, enabled, settings)
values
  (pg_temp.a(), 'employee_files', true, '{}'),
  (pg_temp.b(), 'employee_files', false, '{}');
insert into public.platform_staff (user_id, role)
select pg_temp.p(n), 'onboarder' from generate_series(8, 11) as n;
insert into public.view_sessions (staff_id, business_id, role)
values
  (pg_temp.p(8), pg_temp.a(), 'owner'),
  (pg_temp.p(9), pg_temp.a(), 'manager'),
  (pg_temp.p(10), pg_temp.a(), 'accountant');

-- Stand-in sealed bytes: 0x01 and then `fill`, for someone with a key.
create function pg_temp.sealed(fill text) returns bytea language sql as $$
  select decode('01' || repeat(fill, 40), 'hex')
$$;
insert into private.person_keys (business_id, user_id, kek_id, wrapped_dek)
values
  (pg_temp.a(), pg_temp.p(3), 1, decode('01' || repeat('00', 60), 'hex')),
  (pg_temp.a(), pg_temp.p(4), 1, decode('01' || repeat('00', 60), 'hex'));
-- Noa's file whole; Yoav's with a new account a holder hasn't confirmed.
insert into public.employee_details (
  business_id, user_id, legal_first_name, legal_last_name, birth_date,
  id_kind, id_enc, id_hint, city_code, address_enc,
  bank_code, bank_branch, bank_account_enc, bank_account_hint, bank_holder_kind,
  bank_instruction_at, bank_instruction_version, bank_changed_at, bank_review,
  pension_answer, pension_fund, pension_answered_at
)
values
  (pg_temp.a(), pg_temp.p(3), 'Noa', 'Cohen', '1994-03-01',
   'il', pg_temp.sealed('11'), '4821', 5000, pg_temp.sealed('22'),
   12, 600, pg_temp.sealed('33'), '5677', 'self',
   now(), 'v1', now(), null,
   'existing', 'unknown', now()),
  (pg_temp.a(), pg_temp.p(4), 'Yoav', 'Levi', null,
   null, null, null, null, null,
   12, 600, pg_temp.sealed('55'), '5678', 'self',
   now(), 'v1', now(), 'new',
   null, null, null);
-- This year's 101: Noa's returned, Yoav's due again; 101 has none.
insert into public.employee_tax_years (business_id, user_id, tax_year, status, route, returned_reason, change_due_by)
values
  (pg_temp.a(), pg_temp.p(3), extract(year from (now() at time zone 'Asia/Jerusalem'))::smallint,
   'returned', 'print', 'signature', null),
  (pg_temp.a(), pg_temp.p(4), extract(year from (now() at time zone 'Asia/Jerusalem'))::smallint,
   'change_due', 'print', null, (now() at time zone 'Asia/Jerusalem')::date + 5);
insert into public.member_emergency_contacts (business_id, user_id, contact_enc)
values (pg_temp.a(), pg_temp.p(3), pg_temp.sealed('44'));
-- Noa set it, as set_emergency_contact logs it.
insert into public.audit_log (business_id, actor_id, action, details)
values (pg_temp.a(), pg_temp.p(3), 'member.emergency', jsonb_build_object('person', pg_temp.p(3)));

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function pg_temp.sign_out() returns void language sql as $$
  select set_config('request.jwt.claims', '', true);
  select set_config('role', 'authenticated', true);
$$;
-- What the signed-in person's read of a file answers: who they are to it, or why not.
create function pg_temp.read(business uuid, person uuid) returns text language sql as $$
  select coalesce(x.f ->> 'reason', x.f ->> 'access', 'nothing')
  from (select public.employee_file(business, person) as f) as x
$$;
-- The same of a reveal.
create function pg_temp.reveal(person uuid, fields text[]) returns text language sql as $$
  select coalesce(x.f ->> 'reason', x.f ->> 'access', 'nothing')
  from (select public.reveal_employee_fields(pg_temp.a(), person, fields) as f) as x
$$;
-- The rows of `what` in A's log by `actor`.
create function pg_temp.logged(what text, actor uuid) returns integer language sql as $$
  select count(*)::integer from public.audit_log a
  where a.business_id = pg_temp.a() and a.action = what and a.actor_id = actor
$$;

------------------------------------------------------------------------------
-- Nobody selects the tables

select ok(
  (select bool_and(c.relrowsecurity) from pg_class c
   where c.oid in ('public.employee_details'::regclass, 'public.employee_tax_years'::regclass,
     'public.member_emergency_contacts'::regclass, 'private.person_keys'::regclass)),
  'the file''s tables and its keys have row-level security'
);
select ok(
  not (select bool_or(has_table_privilege(r.role, t.name,
      'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'))
   from (values ('anon'), ('authenticated'), ('service_role')) as r (role)
   cross join (values ('public.employee_details'), ('public.employee_tax_years'),
     ('public.member_emergency_contacts'), ('private.person_keys')) as t (name)),
  'and no privilege on them for anyone, the secret key''s included'
);
select pg_temp.sign_in(pg_temp.p(1));
select throws_ok($$select * from public.employee_details$$, '42501', null,
  'an owner can''t select the files');
select throws_ok($$select * from public.employee_tax_years$$, '42501', null,
  'nor the 101 years');
select throws_ok($$select * from public.member_emergency_contacts$$, '42501', null,
  'nor the emergency contacts');
reset role;

select is(
  (select count(*)::integer
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.prosecdef
     and exists (
       select 1 from unnest(p.proconfig) as c (setting)
       where c.setting in ('search_path=""', 'search_path=')
     )
     and (n.nspname::text, p.proname::text) in (
     ('public', 'employee_data_key'), ('public', 'set_employee_details'),
     ('public', 'set_emergency_contact'), ('public', 'submit_employee_file'),
     ('public', 'note_step_up'), ('public', 'acknowledge_bank'),
     ('public', 'dispute_bank_change'), ('public', 'set_direct_groups'),
     ('public', 'set_tax_year_status'), ('public', 'employee_file'),
     ('public', 'reveal_employee_fields'), ('public', 'export_employee_files'),
     ('public', 'acknowledge_file_duties'), ('public', 'employee_file_status'),
     ('public', 'team_emergency_contacts'), ('public', 'audit_guard_status'),
     ('public', 'note_phone_change'), ('private', 'log_file_denial'),
     ('private', 'file_reader'), ('private', 'file_answer')
   )),
  20,
  'every function of the file runs as its owner, with an empty search_path'
);
select ok(
  (select bool_and(has_function_privilege('service_role', f, 'execute')
      and not has_function_privilege('authenticated', f, 'execute')
      and not has_function_privilege('anon', f, 'execute'))
   from unnest(array[
     'public.employee_data_key(uuid, uuid, uuid, smallint, text)',
     'public.set_employee_details(uuid, uuid, uuid, jsonb, timestamptz)',
     'public.set_emergency_contact(uuid, uuid, text, timestamptz)',
     'public.submit_employee_file(uuid, uuid, timestamptz)',
     'public.note_step_up(uuid, text, timestamptz)',
     'public.acknowledge_bank(uuid, uuid, uuid, timestamptz, timestamptz)',
     'public.dispute_bank_change(uuid, uuid, timestamptz)',
     'public.set_direct_groups(uuid, uuid, uuid, text[], timestamptz)',
     'public.set_tax_year_status(uuid, uuid, uuid, smallint, text, text, date, text, timestamptz)',
     'public.audit_guard_status()'
   ]) as f)
  and (select bool_and(has_function_privilege('authenticated', f, 'execute')
      and not has_function_privilege('anon', f, 'execute'))
   from unnest(array[
     'public.employee_file(uuid, uuid)',
     'public.reveal_employee_fields(uuid, uuid, text[])',
     'public.export_employee_files(uuid, text)',
     'public.acknowledge_file_duties(uuid, text)',
     'public.employee_file_status(uuid)',
     'public.team_emergency_contacts(uuid)'
   ]) as f)
  and not has_function_privilege('authenticated', 'private.file_reader(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.log_file_denial(uuid, uuid, text[], text)', 'execute'),
  'the writes are the secret key''s, the reads a session''s, and the helpers nobody''s'
);

------------------------------------------------------------------------------
-- The key

select results_eq(
  $$select k.key, k.module_key::text, k.area, k.requires, k.settable,
      k.default_roles::text[], k.by_owner
    from public.permission_keys k where k.key = 'people.files'$$,
  $$values ('people.files'::text, 'employee_files'::text, 'employee_files'::text,
      null::text, false, '{}'::text[], true)$$,
  'people.files is the file''s own area, given by an owner, never switched per role'
);
select is(private.accountant_perms(), '{clock.payroll,people.files}'::text[],
  'an accountant holds pay and the files');
select pg_temp.sign_in(pg_temp.p(1));
select ok('people.files' = any (public.my_permissions(pg_temp.a())), 'an owner holds the files');
select pg_temp.sign_in(pg_temp.p(5));
select is(public.my_permissions(pg_temp.a()), '{clock.payroll,people.files}'::text[],
  'an accountant holds pay and the files alone');
select pg_temp.sign_in(pg_temp.p(10));
select ok('people.files' = any (public.my_permissions(pg_temp.a())),
  'a view as an accountant holds them too, on paper (every file refuses a view)');
select pg_temp.sign_in(pg_temp.p(2));
select ok(not ('people.files' = any (public.my_permissions(pg_temp.a()))),
  'a manager doesn''t, by default');
reset role;

------------------------------------------------------------------------------
-- An owner, and the accountant

select pg_temp.sign_in(pg_temp.p(1));
select is(pg_temp.read(pg_temp.a(), pg_temp.p(3)), 'ack',
  'an owner reads no file before confirming the duties');
select throws_ok(
  $$select public.acknowledge_file_duties(pg_temp.a(), '2025-01-v0')$$,
  '22023', 'Not the duties now on screen', 'a wording not on screen is refused'
);
select is(public.acknowledge_file_duties(pg_temp.a(), '2026-11-v1'), true,
  'the owner confirms them');
select public.acknowledge_file_duties(pg_temp.a(), '2026-11-v1');
select is(pg_temp.read(pg_temp.a(), pg_temp.p(3)), 'holder', 'and reads Noa''s file');
select is(pg_temp.read(pg_temp.a(), pg_temp.p(3)), 'holder', 'twice');
-- A read of Yoav's file yesterday doesn't count for today's.
reset role;
insert into public.audit_log (business_id, actor_id, action, details, created_at)
values (pg_temp.a(), pg_temp.p(1), 'employee.view',
  jsonb_build_object('person', pg_temp.p(4), 'fields', jsonb_build_array('file')),
  now() - interval '1 day');
select pg_temp.sign_in(pg_temp.p(1));
select is(pg_temp.read(pg_temp.a(), pg_temp.p(4)), 'holder', 'and Yoav''s');
reset role;
select is(
  (select count(*)::integer from public.audit_log a
   where a.business_id = pg_temp.a() and a.actor_id = pg_temp.p(1)
     and a.action = 'employee.view_denied' and a.details ->> 'reason' = 'ack'),
  1,
  'the refusal before the duties is logged'
);
select is(pg_temp.logged('employee.ack', pg_temp.p(1)), 1,
  'the duties are logged once, however often confirmed');
select is(
  (select count(*)::integer from public.audit_log a
   where a.business_id = pg_temp.a() and a.actor_id = pg_temp.p(1)
     and a.action = 'employee.view' and a.details ->> 'person' = pg_temp.p(3)::text),
  1,
  'two reads of one file on one day are one row'
);
select is(
  (select count(*)::integer from public.audit_log a
   where a.business_id = pg_temp.a() and a.actor_id = pg_temp.p(1)
     and a.action = 'employee.view' and a.details ->> 'person' = pg_temp.p(4)::text),
  2,
  'and a read on another day is another row'
);
select pg_temp.sign_in(pg_temp.p(1));
select ok(
  (select f -> 'file' ->> 'id_hint' = '4821'
     and f -> 'sealed' ? 'address' and not (f -> 'sealed' ? 'id')
     and not (f -> 'sealed' ? 'bank_account')
     and f -> 'key' ->> 'kek_id' = '1'
     and f -> 'missing' = '[]'::jsonb
   from (select public.employee_file(pg_temp.a(), pg_temp.p(3)) as f) as x),
  'the file comes with its plain part, the sealed values a screen opens and the key, never the ID or the account'
);

select pg_temp.sign_in(pg_temp.p(5));
select is(pg_temp.read(pg_temp.a(), pg_temp.p(3)), 'ack', 'the accountant reads none before the duties either');
select public.acknowledge_file_duties(pg_temp.a(), '2026-11-v1');
select is(pg_temp.read(pg_temp.a(), pg_temp.p(3)), 'holder', 'and Noa''s after them');
reset role;

------------------------------------------------------------------------------
-- A manager, given the files and no more

select pg_temp.sign_in(pg_temp.p(2));
select is(pg_temp.read(pg_temp.a(), pg_temp.p(3)), 'not_holder', 'a manager reads no file');
reset role;
select is(
  (select count(*)::integer from public.audit_log a
   where a.business_id = pg_temp.a() and a.actor_id = pg_temp.p(2)
     and a.action = 'employee.view_denied' and a.details ->> 'reason' = 'not_holder'),
  1,
  'and the refusal is logged'
);
select public.set_role_permission(pg_temp.p(1), pg_temp.a(), 'manager', 'people.files', true);
select pg_temp.sign_in(pg_temp.p(12));
select public.acknowledge_file_duties(pg_temp.a(), '2026-11-v1');
select is(pg_temp.read(pg_temp.a(), pg_temp.p(3)), 'holder',
  'a manager reads once the owner gives managers the files, and the duties are confirmed');
reset role;
select public.set_role_permission(pg_temp.p(1), pg_temp.a(), 'manager', 'people.files', false);
select public.set_member_permission(pg_temp.p(1), pg_temp.a(), pg_temp.p(12), 'people.files', true);
select pg_temp.sign_in(pg_temp.p(12));
select is(pg_temp.read(pg_temp.a(), pg_temp.p(3)), 'holder', 'and given them personally');
reset role;
select public.remove_member(pg_temp.p(1), pg_temp.a(), pg_temp.p(12));
select pg_temp.sign_in(pg_temp.p(12));
select is(pg_temp.read(pg_temp.a(), pg_temp.p(3)), 'not_member', 'but no more once off the team');
reset role;

------------------------------------------------------------------------------
-- A worker

select pg_temp.sign_in(pg_temp.p(3));
select is(pg_temp.read(pg_temp.a(), pg_temp.p(3)), 'self', 'Noa reads her own file');
select is(pg_temp.read(pg_temp.a(), pg_temp.p(4)), 'not_holder', 'and not Yoav''s');
select pg_temp.sign_in(pg_temp.p(6));
select is(pg_temp.read(pg_temp.a(), pg_temp.p(6)), 'self', 'someone who left still reads their own');
reset role;
select is(pg_temp.logged('employee.view', pg_temp.p(3)), 0, 'a person''s own read is not logged');
select is(pg_temp.logged('employee.view_denied', pg_temp.p(3)), 1, 'their refused one is');

------------------------------------------------------------------------------
-- Outside the business, a view, nobody

select pg_temp.sign_in(pg_temp.p(7));
select is(pg_temp.read(pg_temp.a(), gen_random_uuid()), 'not_member', 'another business''s owner reads nothing');
reset role;
select is(pg_temp.logged('employee.view_denied', pg_temp.p(7)), 0,
  'and an id that isn''t in the business leaves no row');
select pg_temp.sign_in(pg_temp.p(7));
select is(
  (select count(*)::integer from generate_series(1, 22) as n
   where pg_temp.read(pg_temp.a(), pg_temp.p(3)) = 'not_member'),
  22,
  'every try of someone outside is told not_member, never more'
);
reset role;
select results_eq(
  $$select a.details ->> 'reason', count(*)::integer from public.audit_log a
    where a.business_id = pg_temp.a() and a.actor_id = pg_temp.p(7)
      and a.action = 'employee.view_denied'
    group by 1 order by 1$$,
  $$values ('many'::text, 1), ('not_member'::text, 20)$$,
  'twenty refusals a day are logged, then one "many", then nothing'
);
select pg_temp.sign_in(pg_temp.p(7));
select is(pg_temp.read(pg_temp.b(), pg_temp.p(7)), 'off', 'with the module off, not even the owner''s own');
reset role;
select is(
  (select count(*)::integer from public.audit_log a
   where a.business_id = pg_temp.b() and a.action ~ '^employee\.'),
  0,
  'and that is not logged'
);

select pg_temp.sign_in(pg_temp.p(8));
select is(pg_temp.read(pg_temp.a(), pg_temp.p(3)), 'viewing', 'a view as an owner reads no file');
select pg_temp.sign_in(pg_temp.p(9));
select is(pg_temp.read(pg_temp.a(), pg_temp.p(3)), 'viewing', 'nor as a manager');
select pg_temp.sign_in(pg_temp.p(10));
select is(pg_temp.read(pg_temp.a(), pg_temp.p(3)), 'viewing', 'nor as an accountant');
select pg_temp.sign_in(pg_temp.p(11));
select is(pg_temp.read(pg_temp.a(), pg_temp.p(3)), 'not_member', 'nor the ConceptApp team without a view');
reset role;
select is(
  (select count(*)::integer from public.audit_log a
   where a.business_id = pg_temp.a() and a.action = 'employee.view_denied'
     and a.actor_id in (pg_temp.p(8), pg_temp.p(9), pg_temp.p(10))
     and a.details ->> 'reason' = 'viewing'),
  3,
  'each view''s refusal is logged as a view''s'
);
select pg_temp.sign_out();
select ok(public.employee_file(pg_temp.a(), pg_temp.p(3)) is null, 'signed out: nothing');
reset role;
select is(
  (select count(*)::integer from public.audit_log a
   where a.business_id = pg_temp.a() and a.action = 'employee.view_denied' and a.actor_id is null),
  0,
  'and nothing logged'
);

------------------------------------------------------------------------------
-- The two numbers

select pg_temp.sign_in(pg_temp.p(1));
select ok(
  (select f -> 'sealed' ->> 'id' is not null and f -> 'sealed' ->> 'bank_account' is not null
   from (select public.reveal_employee_fields(pg_temp.a(), pg_temp.p(3), '{id,bank_account}') as f) as x),
  'a holder reveals both numbers, sealed'
);
select is(pg_temp.reveal(pg_temp.p(3), '{id}'), 'holder', 'and again');
reset role;
select results_eq(
  $$select a.details -> 'fields' from public.audit_log a
    where a.business_id = pg_temp.a() and a.actor_id = pg_temp.p(1)
      and a.action = 'employee.view' and a.details ->> 'person' = pg_temp.p(3)::text
      and a.details -> 'fields' <> '["file"]'::jsonb
    order by a.id$$,
  $$values ('["bank_account", "id"]'::jsonb), ('["id"]'::jsonb)$$,
  'each reveal is logged, with what it revealed'
);
select pg_temp.sign_in(pg_temp.p(1));
select is(
  (select count(*)::integer from generate_series(101, 129) as n
   where pg_temp.reveal(pg_temp.p(n), '{id}') = 'holder'),
  29,
  'a holder reveals 29 more people''s'
);
select is(pg_temp.reveal(pg_temp.p(131), '{id}'), 'limit', 'but not a 31st in the hour');
select is(pg_temp.reveal(pg_temp.p(101), '{id}'), 'holder', 'while one already revealed again is fine');
reset role;
select is(
  (select count(*)::integer from public.audit_log a
   where a.business_id = pg_temp.a() and a.actor_id = pg_temp.p(1)
     and a.action = 'employee.view_denied' and a.details ->> 'reason' = 'limit'),
  1,
  'the limit''s refusal is logged'
);
-- The count is taken under the holder's lock, held to the end of the
-- transaction, so parallel reveals count one after another.
select ok(
  exists (
    select 1 from pg_locks l
    where l.locktype = 'advisory' and l.pid = pg_backend_pid() and l.granted and l.objsubid = 1
      and ((l.classid::bigint << 32) | l.objid::bigint)
        = hashtextextended('employee.reveal:' || pg_temp.a()::text || ':' || pg_temp.p(1)::text, 0)
  ),
  'a holder''s reveals are counted one at a time'
);
select pg_temp.sign_in(pg_temp.p(2));
select is(pg_temp.reveal(pg_temp.p(3), '{id}'), 'not_holder', 'a manager reveals nothing, and nothing raises');
select pg_temp.sign_in(pg_temp.p(3));
select is(pg_temp.reveal(pg_temp.p(3), '{id}'), 'self', 'Noa reveals her own');
select throws_ok(
  $$select public.reveal_employee_fields(pg_temp.a(), pg_temp.p(3), '{address}')$$,
  '22023', null, 'only the two numbers are revealed'
);
reset role;
select is(pg_temp.logged('employee.view', pg_temp.p(3)), 0, 'her own reveal is not logged');

------------------------------------------------------------------------------
-- The export, the status, the contacts

select pg_temp.sign_in(pg_temp.p(1));
select ok(
  (select f ->> 'access' = 'holder'
     and jsonb_array_length(f -> 'entries') = 2
     and (select bool_and(
           (e ->> 'bank_held')::boolean = (e ->> 'user_id' = pg_temp.p(4)::text)
           and (e ->> 'bank_held')::boolean = (e -> 'sealed' ->> 'bank_account' is null)
           and (e ->> 'bank_held')::boolean = (e -> 'file' ->> 'bank_code' is null))
         from jsonb_array_elements(f -> 'entries') as e)
   from (select public.export_employee_files(pg_temp.a(), 'provider') as f) as x),
  'the export has every file, with an account a holder hasn''t confirmed held back'
);
select pg_temp.sign_in(pg_temp.p(2));
select is(
  (select f ->> 'reason' from (select public.export_employee_files(pg_temp.a(), 'own') as f) as x),
  'not_holder',
  'a manager exports nothing'
);
reset role;
select results_eq(
  $$select a.details from public.audit_log a
    where a.business_id = pg_temp.a() and a.action = 'employee.export'$$,
  $$values ('{"held": 1, "people": 2, "recipient": "provider"}'::jsonb)$$,
  'the export is logged once, by how many and for whom'
);

select pg_temp.sign_in(pg_temp.p(1));
select ok(
  (select count(*) = 34 and bool_and(s.detail is not null)
     and not bool_or(s.user_id = pg_temp.p(1))
   from public.employee_file_status(pg_temp.a()) s),
  'a holder reads every manager''s and worker''s status with its details, the owner left out'
);
select pg_temp.sign_in(pg_temp.p(2));
select results_eq(
  $$select s.user_id, s.complete, s.form101_in, s.detail is null
    from public.employee_file_status(pg_temp.a()) s
    where s.user_id in (pg_temp.p(3), pg_temp.p(4), pg_temp.p(101))
    order by s.user_id$$,
  $$values (pg_temp.p(3), true, false, true), (pg_temp.p(4), false, true, true),
      (pg_temp.p(101), false, false, true)$$,
  'a manager reads a count and the 101, a returned one as not in and one due again as in, never the details'
);
select pg_temp.sign_in(pg_temp.p(3));
select is((select count(*)::integer from public.employee_file_status(pg_temp.a())), 0,
  'a worker reads no one''s status');
select pg_temp.sign_in(pg_temp.p(9));
select ok(
  (select count(*) > 0 and bool_and(s.detail is null) from public.employee_file_status(pg_temp.a()) s),
  'a view as a manager reads the status, never the details'
);
select is((select count(*)::integer from public.team_emergency_contacts(pg_temp.a())), 0,
  'and no emergency contact');
select pg_temp.sign_in(pg_temp.p(2));
select results_eq(
  $$select c.user_id, c.kek_id from public.team_emergency_contacts(pg_temp.a()) c$$,
  $$values (pg_temp.p(3), 1::smallint)$$,
  'a manager reads the staff''s emergency contacts, sealed, with their keys'
);
select pg_temp.sign_in(pg_temp.p(4));
select is((select count(*)::integer from public.team_emergency_contacts(pg_temp.a())), 0,
  'a worker doesn''t');
reset role;

------------------------------------------------------------------------------
-- The log's rows

select pg_temp.sign_in(pg_temp.p(1));
select ok(
  (select count(*) > 0 from public.audit_log a
   where a.business_id = pg_temp.a() and a.action ~ '^employee\.'),
  'the owner reads the file''s rows'
);
select pg_temp.sign_in(pg_temp.p(2));
select ok(
  (select count(*) = 0 from public.audit_log a
   where a.business_id = pg_temp.a() and a.action ~ '^employee\.')
  and (select count(*) = 1 from public.audit_log a
   where a.business_id = pg_temp.a() and a.action = 'member.emergency'),
  'a manager without the files reads none, but the emergency contact''s, the team''s'
);
select pg_temp.sign_in(pg_temp.p(5));
select ok(
  (select count(*) > 0 from public.audit_log a
   where a.business_id = pg_temp.a() and a.action ~ '^employee\.'),
  'the accountant reads them'
);
select pg_temp.sign_in(pg_temp.p(8));
select ok(
  (select count(*) = 0 from public.audit_log a
   where a.business_id = pg_temp.a() and a.action ~ '^employee\.'),
  'a view as the owner reads none'
);
reset role;
select is_empty(
  $$select a.id from public.audit_log a
    where a.business_id = pg_temp.a() and a.action ~ '^(employee|member)\.'
      and a.details::text ~ '4821|5677|5678|Noa|Cohen'$$,
  'no row of the file holds a value or a hint'
);

select * from finish();
rollback;
