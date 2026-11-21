-- The hiring file in a demo, and the log's nightly check
-- (20261126000200_employee_files.sql; profile H4): a reset gives every
-- active manager and worker a file of made-up values by its definition's
-- "files" (0x00 first, IDs from the test range, emails that can't receive
-- mail, the cases on the people they name), with no log row and no key,
-- leaving payroll's birth date open; a demo that keeps its files refuses
-- writes and contacts; 0x00 is refused in
-- a business that isn't a demo; the purge takes every file table's rows and
-- the reset runs clean after it, twice; and the nightly check names what is
-- missing of the log's guards and the files', records a run, and is read
-- with the secret key alone. Fixed ids (f3…), numbers (050-076-xxxx) and
-- slugs (efd-…).
begin;
select plan(31);

-- The demo: 1 its owner, 2 a manager, 3 to 10 workers, 11 its accountant.
-- 12 owns a business that isn't a demo.
insert into auth.users (id, aud, role, phone)
select ('f3000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250076' || lpad(n::text, 4, '0')
from generate_series(1, 12) as n;

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('f3000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.d() returns uuid language sql as $$
  select 'f3000000-0000-4000-b000-000000000001'::uuid
$$;
create function pg_temp.r() returns uuid language sql as $$
  select 'f3000000-0000-4000-b000-000000000002'::uuid
$$;
-- A demo value's text.
create function pg_temp.plain(value bytea) returns text language sql as $$
  select convert_from(substring(value from 2), 'UTF8')
$$;

insert into private.demo_businesses (business_id, definition)
values (pg_temp.d(), $json$
  {
    "slug": "efd-demo", "name": "Files demo", "accent": "#7c3aed",
    "address": "Demo street 3", "shabbat_city": "haifa",
    "template": "retail", "renews": false,
    "details": { "since": "2026-03-01", "numbers": 101, "cases": [
      { "user_id": "f3000000-0000-4000-a000-000000000010", "case": "youth" }
    ] },
    "files": { "cases": [
      { "user_id": "f3000000-0000-4000-a000-000000000003", "case": "no_file" },
      { "user_id": "f3000000-0000-4000-a000-000000000004", "case": "no_bank" },
      { "user_id": "f3000000-0000-4000-a000-000000000005", "case": "bank_new" },
      { "user_id": "f3000000-0000-4000-a000-000000000006", "case": "bank_warned" },
      { "user_id": "f3000000-0000-4000-a000-000000000007", "case": "passport" },
      { "user_id": "f3000000-0000-4000-a000-000000000007", "case": "form101_returned" },
      { "user_id": "f3000000-0000-4000-a000-000000000008", "case": "direct_pension" },
      { "user_id": "f3000000-0000-4000-a000-000000000008", "case": "form101_missing" },
      { "user_id": "f3000000-0000-4000-a000-000000000009", "case": "form101_change_due" },
      { "user_id": "f3000000-0000-4000-a000-000000000009", "case": "emergency" }
    ] },
    "people": [
      { "user_id": "f3000000-0000-4000-a000-000000000001", "role": "owner", "name": "Owner One" },
      { "user_id": "f3000000-0000-4000-a000-000000000002", "role": "manager", "name": "Manager Two" },
      { "user_id": "f3000000-0000-4000-a000-000000000003", "role": "worker", "name": "Worker Three" },
      { "user_id": "f3000000-0000-4000-a000-000000000004", "role": "worker", "name": "Worker Four" },
      { "user_id": "f3000000-0000-4000-a000-000000000005", "role": "worker", "name": "Worker Five" },
      { "user_id": "f3000000-0000-4000-a000-000000000006", "role": "worker", "name": "Worker Six" },
      { "user_id": "f3000000-0000-4000-a000-000000000007", "role": "worker", "name": "Worker Seven" },
      { "user_id": "f3000000-0000-4000-a000-000000000008", "role": "worker", "name": "Worker Eight" },
      { "user_id": "f3000000-0000-4000-a000-000000000009", "role": "worker", "name": "Worker Nine" },
      { "user_id": "f3000000-0000-4000-a000-000000000010", "role": "worker", "name": "Worker Ten" },
      { "user_id": "f3000000-0000-4000-a000-000000000011", "role": "accountant", "name": "Accountant Eleven" }
    ]
  }
  $json$);

set local role service_role;
select lives_ok($$select public.reset_demo_business(pg_temp.d())$$, 'the demo is made');
reset role;

------------------------------------------------------------------------------
-- Its files

select results_eq(
  $$select e.user_id from public.employee_details e where e.business_id = pg_temp.d() order by e.user_id$$,
  $$select pg_temp.p(n) from unnest(array[2, 4, 5, 6, 7, 8, 9, 10]) as n$$,
  'every manager and worker has a file, but the one the definition leaves without'
);
select ok(
  (select bool_and(get_byte(e.id_enc, 0) = 0 and get_byte(e.address_enc, 0) = 0
      and get_byte(e.email_enc, 0) = 0
      and (e.bank_account_enc is null or get_byte(e.bank_account_enc, 0) = 0))
   from public.employee_details e where e.business_id = pg_temp.d()),
  'each value is a demo''s made-up text, never sealed'
);
select ok(
  (select bool_and(pg_temp.plain(e.id_enc) ~ '^0000000[0-9]{2}$' and e.id_hint = right(pg_temp.plain(e.id_enc), 4))
   from public.employee_details e where e.business_id = pg_temp.d() and e.id_kind = 'il'),
  'the IDs are from the test range, with their hints'
);
select ok(
  (select bool_and(pg_temp.plain(e.email_enc) like '%@demo.conceptapp.invalid'
      and e.city_code = 4000 and pg_temp.plain(e.address_enc)::jsonb ->> 'kind' = 'street')
   from public.employee_details e where e.business_id = pg_temp.d()),
  'the emails can''t receive mail, and the addresses are in the business''s city'
);
select ok(
  (select bool_and(e.legal_first_name = split_part(p.full_name, ' ', 1)
      and e.legal_last_name = split_part(p.full_name, ' ', 2))
   from public.employee_details e join public.profiles p on p.id = e.user_id
   where e.business_id = pg_temp.d()),
  'the names as on the ID are the people''s own'
);
select results_eq(
  $$select e.user_id, e.bank_review, e.bank_account_enc is null,
      coalesce(pg_temp.plain(e.bank_account_enc), '')
    from public.employee_details e
    where e.business_id = pg_temp.d() and e.user_id in (pg_temp.p(2), pg_temp.p(4), pg_temp.p(5), pg_temp.p(6))
    order by e.user_id$$,
  $$values (pg_temp.p(2), null::text, false, '100001'::text),
      (pg_temp.p(4), null::text, true, ''::text),
      (pg_temp.p(5), 'new'::text, false, '100014'::text),
      (pg_temp.p(6), 'warned'::text, false, '100002'::text)$$,
  'a complete account, none, one new and one that warned'
);
select ok(
  (select e.bank_changed_at > now() - interval '3 days' from public.employee_details e
   where e.business_id = pg_temp.d() and e.user_id = pg_temp.p(5))
  and (select e.bank_changed_at < now() - interval '30 days' from public.employee_details e
   where e.business_id = pg_temp.d() and e.user_id = pg_temp.p(2)),
  'the new one changed two days ago, the others long before'
);
select results_eq(
  $$select e.id_kind, e.id_country, e.id_expires_on > now()::date from public.employee_details e
    where e.business_id = pg_temp.d() and e.user_id = pg_temp.p(7)$$,
  $$values ('passport'::text, 'PH'::text, true)$$,
  'a passport, with its country and expiry'
);
select results_eq(
  $$select e.direct_groups, e.pension_answer from public.employee_details e
    where e.business_id = pg_temp.d() and e.user_id = pg_temp.p(8)$$,
  $$values ('{pension}'::text[], null::text)$$,
  'a pension handed directly, with no answer'
);
select results_eq(
  $$select y.user_id, y.status, y.returned_reason,
      coalesce(y.change_due_by - (now() at time zone 'Asia/Jerusalem')::date, -1)
    from public.employee_tax_years y where y.business_id = pg_temp.d()
    order by y.user_id$$,
  $$values (pg_temp.p(2), 'handed_in'::text, null::text, -1),
      (pg_temp.p(4), 'handed_in'::text, null::text, -1),
      (pg_temp.p(5), 'handed_in'::text, null::text, -1),
      (pg_temp.p(6), 'handed_in'::text, null::text, -1),
      (pg_temp.p(7), 'returned'::text, 'signature'::text, -1),
      (pg_temp.p(9), 'change_due'::text, null::text, 5),
      (pg_temp.p(10), 'handed_in'::text, null::text, -1)$$,
  'this year''s 101 handed in on paper, but one missing, one returned and one due again in 5 days'
);
select results_eq(
  $$select c.user_id, pg_temp.plain(c.contact_enc)::jsonb
    from public.member_emergency_contacts c where c.business_id = pg_temp.d()$$,
  $$values (pg_temp.p(9), '{"name": "איש קשר להדגמה", "phone": "+972500000999"}'::jsonb)$$,
  'and one emergency contact'
);
select ok(
  (select e.birth_date = (d.youth_until - interval '18 years')::date and d.youth_until > now()::date
   from public.employee_details e
   join public.member_payroll_details d on d.business_id = e.business_id and d.user_id = e.user_id
   where e.business_id = pg_temp.d() and e.user_id = pg_temp.p(10)),
  'the minor''s birth date agrees with their youth_until'
);
select is(
  (select count(*)::integer from public.audit_log a
   where a.business_id = pg_temp.d() and a.action ~ '^(employee\.|member\.emergency)')
  + (select count(*)::integer from private.person_keys k where k.business_id = pg_temp.d()),
  0,
  'with no log row and no key'
);
-- The made-up files hold birth dates nobody can change there, so payroll's
-- details still take one (P5's sheet, the accountant's e2e).
select lives_ok(
  $$select public.set_payroll_details(pg_temp.p(11), pg_temp.d(), pg_temp.p(4),
    '{"birth_date": "1990-01-02"}')$$,
  'payroll takes a birth date the demo''s file holds, the module off'
);

------------------------------------------------------------------------------
-- Closed, and nowhere else

update private.file_settings set real_values = true;
update public.business_modules set enabled = true
where business_id = pg_temp.d() and module_key = 'employee_files';
select throws_ok(
  $$select public.set_employee_details(pg_temp.p(4), pg_temp.d(), pg_temp.p(4),
    '{"names": {"first": "A", "last": "Visitor"}}')$$,
  '55000', 'A demo business keeps its made-up files', 'a demo keeps its files, the module on'
);
select throws_ok(
  $$select public.set_emergency_contact(pg_temp.p(4), pg_temp.d(), null)$$,
  '55000', 'A demo business keeps its made-up files', 'and its contacts'
);
select lives_ok(
  $$select public.set_payroll_details(pg_temp.p(11), pg_temp.d(), pg_temp.p(4),
    '{"birth_date": "1990-01-03"}')$$,
  'and with it on, while the demo keeps its files'
);
insert into public.businesses (id, slug, name) values (pg_temp.r(), 'efd-real', 'Real');
insert into public.memberships (business_id, user_id, role)
values (pg_temp.r(), pg_temp.p(12), 'owner');
select throws_ok(
  $$insert into public.employee_details (business_id, user_id, email_enc)
    values (pg_temp.r(), pg_temp.p(12), decode('00' || repeat('61', 20), 'hex'))$$,
  '22023', 'Not sealed', 'a made-up value is a demo''s alone'
);

------------------------------------------------------------------------------
-- The purge, and the reset again

insert into private.person_keys (business_id, user_id, kek_id, wrapped_dek)
values (pg_temp.d(), pg_temp.p(2), 1, decode('01' || repeat('00', 60), 'hex'));
insert into private.file_acknowledgements (business_id, user_id, version)
values (pg_temp.d(), pg_temp.p(1), '2026-11-v1');
select private.purge_business_records(pg_temp.d());
select is(
  (select count(*)::integer from public.employee_details e where e.business_id = pg_temp.d())
  + (select count(*)::integer from public.employee_tax_years y where y.business_id = pg_temp.d())
  + (select count(*)::integer from public.member_emergency_contacts c where c.business_id = pg_temp.d())
  + (select count(*)::integer from private.person_keys k where k.business_id = pg_temp.d())
  + (select count(*)::integer from private.file_acknowledgements f where f.business_id = pg_temp.d()),
  0,
  'the purge takes every row of the files'
);
set local role service_role;
select lives_ok($$select public.reset_demo_business(pg_temp.d())$$, 'the reset runs after it');
select lives_ok($$select public.reset_demo_business(pg_temp.d())$$, 'and again');
reset role;
select is(
  (select count(*)::integer from public.employee_details e where e.business_id = pg_temp.d()),
  8,
  'with the files back'
);

------------------------------------------------------------------------------
-- The log's nightly check

select is(private.audit_guard_problems(), '{}'::text[], 'the log and the files are guarded');
alter table public.audit_log disable trigger audit_log_kept;
select ok('audit_log_kept' = any (private.audit_guard_problems()), 'a trigger switched off is named');
alter table public.audit_log enable trigger audit_log_kept;
grant update on public.audit_log to service_role;
select ok('audit_log:service_role:update' = any (private.audit_guard_problems()),
  'so is a privilege given back');
revoke update on public.audit_log from service_role;
alter table public.employee_details disable row level security;
select ok('employee_details:rls' = any (private.audit_guard_problems()),
  'and a file table open to every row');
alter table public.employee_details enable row level security;
select private.audit_guard_tick();
select results_eq(
  $$select r.problems from private.audit_guard_runs r order by r.id desc limit 1$$,
  $$values ('{}'::text[])$$,
  'the nightly run records what it found: nothing missing'
);
set local role service_role;
select is(public.audit_guard_status() -> 'problems', '[]'::jsonb,
  'the secret key reads the newest run');
reset role;
set local role authenticated;
select throws_ok($$select public.audit_guard_status()$$, '42501', null,
  'a session doesn''t');
reset role;
select ok(
  exists (select 1 from cron.job j where j.jobname = 'audit-guard' and j.schedule = '41 2 * * *'),
  'the check runs every night'
);

select * from finish();
rollback;
