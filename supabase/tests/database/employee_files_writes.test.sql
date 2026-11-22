-- The hiring file, its writes (20261126000200_employee_files.sql; profile
-- H4): closed while real values aren't open, the module is off or a demo
-- keeps its files, and open in a demo that says so; who writes what (the
-- person their own, a holder who confirmed the duties the names, the birth
-- date and the ID, also for someone who left, an owner's file only an
-- owner, never an accountant's); the sealed values checked; the data key
-- made once; the bank, a new account or one withdrawn, behind a fresh code,
-- never in the week after a phone change (and that week read on its own,
-- before a code goes, its day in the business's zone), every new account
-- waiting for a holder; the 101 due again when a detail is replaced; youth_until from the
-- birth date, and payroll's birth date closed once the file holds one and
-- takes writes; nothing written for what is stored
-- already; the contact, the sending, the bank's confirmation and dispute,
-- what went directly to payroll and the 101's marks; and nothing deleting a
-- file, a key or the log. Every write at 10:00 on 26 November 2026 in
-- Israel. Fixed ids (f2…), numbers (050-075-xxxx) and slugs (efw-…).
begin;
select plan(97);

-- A: 1 its owner, 2 a manager holding the files who confirmed the duties,
-- 3 Noa and 4 Yoav, workers, 5 the accountant, 6 a worker who left, 7 a
-- manager holding the files who hasn't confirmed them. B (the module off):
-- 8 its owner. D (a demo that keeps its files): 9 its owner, 10 a worker.
-- O (a demo whose files are open): 11 its owner. 13 is in no business; 14
-- has no phone yet.
insert into auth.users (id, aud, role, phone)
select ('f2000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated',
  case when n = 14 then null else '97250075' || lpad(n::text, 4, '0') end
from generate_series(1, 14) as n;

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('f2000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.biz(n integer) returns uuid language sql as $$
  select ('f2000000-0000-4000-b000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.a() returns uuid language sql as $$
  select pg_temp.biz(1)
$$;
create function pg_temp.at() returns timestamptz language sql as $$
  select '2026-11-26 10:00+02'::timestamptz
$$;

insert into public.businesses (id, slug, name)
values
  (pg_temp.biz(1), 'efw-a', 'Writes A'),
  (pg_temp.biz(2), 'efw-b', 'Writes B'),
  (pg_temp.biz(3), 'efw-d', 'Writes D'),
  (pg_temp.biz(4), 'efw-o', 'Writes O');
insert into public.memberships (business_id, user_id, role, active, perms)
values
  (pg_temp.biz(1), pg_temp.p(1), 'owner', true, '{}'),
  (pg_temp.biz(1), pg_temp.p(2), 'manager', true, '{people.files}'),
  (pg_temp.biz(1), pg_temp.p(3), 'worker', true, '{}'),
  (pg_temp.biz(1), pg_temp.p(4), 'worker', true, '{}'),
  (pg_temp.biz(1), pg_temp.p(5), 'accountant', true, '{}'),
  (pg_temp.biz(1), pg_temp.p(6), 'worker', false, '{}'),
  (pg_temp.biz(1), pg_temp.p(7), 'manager', true, '{people.files}'),
  (pg_temp.biz(2), pg_temp.p(8), 'owner', true, '{}'),
  (pg_temp.biz(3), pg_temp.p(9), 'owner', true, '{}'),
  (pg_temp.biz(3), pg_temp.p(10), 'worker', true, '{}'),
  (pg_temp.biz(4), pg_temp.p(11), 'owner', true, '{}');
insert into public.business_modules (business_id, module_key, enabled, settings)
values
  (pg_temp.biz(1), 'employee_files', true, '{}'),
  (pg_temp.biz(1), 'time_clock', true, '{}'),
  (pg_temp.biz(2), 'employee_files', false, '{}'),
  (pg_temp.biz(3), 'employee_files', true, '{}'),
  (pg_temp.biz(4), 'employee_files', true, '{}');
insert into private.demo_businesses (business_id, definition)
values
  (pg_temp.biz(3), '{"slug": "efw-d"}'),
  (pg_temp.biz(4), '{"slug": "efw-o", "fileWrites": true}');
insert into private.file_acknowledgements (business_id, user_id, version)
values (pg_temp.a(), pg_temp.p(2), '2026-11-v1');

-- base64 of 0x01 and `bytes` more of `fill`: what @db/crypto would send.
create function pg_temp.s(fill text, bytes integer default 40) returns text language sql as $$
  select translate(encode(decode('01' || repeat(fill, bytes), 'hex'), 'base64'), chr(10), '')
$$;
-- A wrapped data key: 61 bytes, 0x01 first.
create function pg_temp.key() returns text language sql as $$
  select pg_temp.s('ab', 60)
$$;
-- `actor` changes `person`'s file in A, at 10:00.
create function pg_temp.set(actor integer, person integer, patch jsonb)
returns jsonb language sql as $$
  select public.set_employee_details(pg_temp.p(actor), pg_temp.a(), pg_temp.p(person), patch, pg_temp.at())
$$;
-- 'ok', or the refusal's code and hint; a refusal undoes what it began.
create function pg_temp.try(query text) returns text language plpgsql as $$
declare
  code text;
  why text;
begin
  execute query;
  return 'ok';
exception when others then
  get stacked diagnostics code = returned_sqlstate, why = pg_exception_hint;
  return code || case when coalesce(why, '') = '' then '' else ':' || why end;
end;
$$;
-- The refusal's DETAIL (a phone_hold's day), or null when nothing refused.
create function pg_temp.refused_on(query text) returns text language plpgsql as $$
declare
  said text;
begin
  execute query;
  return null;
exception when others then
  get stacked diagnostics said = pg_exception_detail;
  return said;
end;
$$;
-- An account as the person's own write sends it.
create function pg_temp.bank(check_said text) returns jsonb language sql as $$
  select jsonb_build_object('bank', jsonb_build_object(
    'code', 12, 'branch', 600, 'sealed', pg_temp.s('33'), 'hint', '5677',
    'holder', 'self', 'instruction', 'v1', 'check', check_said))
$$;
create function pg_temp.names(first_name text) returns jsonb language sql as $$
  select jsonb_build_object('names', jsonb_build_object('first', first_name, 'last', 'Cohen'))
$$;
create function pg_temp.logged(what text, actor integer) returns integer language sql as $$
  select count(*)::integer from public.audit_log a
  where a.business_id = pg_temp.a() and a.action = what and a.actor_id = pg_temp.p(actor)
$$;
create function pg_temp.file(person integer) returns public.employee_details language sql as $$
  select * from public.employee_details e
  where e.business_id = pg_temp.a() and e.user_id = pg_temp.p(person)
$$;
create temporary table seen (what text primary key, n integer);

------------------------------------------------------------------------------
-- Who may write

select is(pg_temp.try($$select pg_temp.set(3, 3, pg_temp.names('Noa'))$$), '55000:not_open',
  'a business that isn''t a demo takes no real values until they are opened');
update private.file_settings set real_values = true, changed_at = now();
select is(
  pg_temp.try($$select public.set_employee_details(pg_temp.p(8), pg_temp.biz(2), pg_temp.p(8),
    '{"names": {"first": "B", "last": "Owner"}}', pg_temp.at())$$),
  '42501:off', 'with the module off, nothing is written');
select is(
  pg_temp.try($$select public.set_employee_details(pg_temp.p(10), pg_temp.biz(3), pg_temp.p(10),
    '{"names": {"first": "D", "last": "Worker"}}', pg_temp.at())$$),
  '55000:demo', 'a demo keeps its made-up files');
select is(
  pg_temp.try($$select public.set_employee_details(pg_temp.p(11), pg_temp.biz(4), pg_temp.p(11),
    '{"names": {"first": "O", "last": "Owner"}}', pg_temp.at())$$),
  'ok', 'and one that opens them writes');
select is(pg_temp.try($$select pg_temp.set(3, 3, '{"religion": "x"}')$$), '22023',
  'a detail the file doesn''t have is refused');
select is(pg_temp.try($$select pg_temp.set(4, 3, pg_temp.names('Noa'))$$), '42501',
  'a colleague writes nobody''s file');
select is(pg_temp.try($$select pg_temp.set(7, 3, pg_temp.names('Noa'))$$), '42501:ack',
  'nor does a holder before the duties');
select is(pg_temp.try($$select pg_temp.set(2, 3, pg_temp.names('Noa'))$$), 'ok',
  'a holder writes someone''s names');
select is(pg_temp.try($$select pg_temp.set(2, 6, '{"birth_date": "1990-01-02"}')$$), 'ok',
  'and the birth date of someone who left');
select is(
  pg_temp.try($$select pg_temp.set(2, 3, jsonb_build_object('email', pg_temp.s('aa')))$$),
  '42501:own', 'but not their email');
select is(pg_temp.try($$select pg_temp.set(2, 3, '{"pension": {"answer": "later"}}')$$),
  '42501:own', 'nor their pension');
select is(pg_temp.try($$select pg_temp.set(2, 1, pg_temp.names('Uri'))$$), '42501:owner',
  'and an owner''s file only an owner writes');
select is(pg_temp.try($$select pg_temp.set(1, 5, pg_temp.names('Galit'))$$), '22023:not_staff',
  'an accountant has no file');
select is(pg_temp.try($$select pg_temp.set(13, 3, pg_temp.names('Noa'))$$), '42501',
  'and someone outside the business writes none');
select results_eq(
  $$select a.details from public.audit_log a
    where a.business_id = pg_temp.a() and a.action = 'employee.details' and a.actor_id = pg_temp.p(2)
    order by a.id$$,
  $$values (jsonb_build_object('person', pg_temp.p(3), 'fields', jsonb_build_array('names'))),
      (jsonb_build_object('person', pg_temp.p(6), 'fields', jsonb_build_array('birth_date')))$$,
  'each write logs the groups it changed, never a value'
);

------------------------------------------------------------------------------
-- The data key, and sealed values

select is(
  public.employee_data_key(pg_temp.p(3), pg_temp.a(), pg_temp.p(3), 1::smallint, pg_temp.key()) ->> 'kek_id',
  '1', 'the person''s first key is kept');
select is(
  public.employee_data_key(pg_temp.p(2), pg_temp.a(), pg_temp.p(3), 2::smallint, pg_temp.key()) ->> 'kek_id',
  '1', 'and comes back to whoever offers another');
select is(
  pg_temp.try($$select public.employee_data_key(pg_temp.p(13), pg_temp.a(), pg_temp.p(3), 1::smallint, pg_temp.key())$$),
  '42501', 'nobody outside the business gets it');
select is(
  pg_temp.try($$select public.employee_data_key(pg_temp.p(3), pg_temp.a(), pg_temp.p(3), 1::smallint, pg_temp.s('ab', 20))$$),
  '22023', 'a key is 61 bytes');
select public.employee_data_key(pg_temp.p(4), pg_temp.a(), pg_temp.p(4), 1::smallint, pg_temp.key());

select is(pg_temp.try($$select pg_temp.set(3, 3, '{"email": "not base64!"}')$$), '22023',
  'a sealed value is base64');
select is(
  pg_temp.try($$select pg_temp.set(3, 3, jsonb_build_object('email',
    translate(encode(decode('02' || repeat('aa', 40), 'hex'), 'base64'), chr(10), '')))$$),
  '22023', 'of this format');
select is(pg_temp.try($$select pg_temp.set(3, 3, jsonb_build_object('email', pg_temp.s('aa', 19)))$$),
  '22023', 'with more than its header');
select is(pg_temp.try($$select pg_temp.set(3, 3, jsonb_build_object('email', pg_temp.s('aa', 600)))$$),
  '22023', 'and no longer than its field');
select is(
  pg_temp.try($$select pg_temp.set(3, 3, jsonb_build_object('identity',
    jsonb_build_object('kind', 'il', 'sealed', pg_temp.s('11'), 'hint', '48')))$$),
  '22023', 'a hint is four characters');
select is(
  pg_temp.try($$select pg_temp.set(3, 3, jsonb_build_object('identity',
    jsonb_build_object('kind', 'passport', 'sealed', pg_temp.s('11'), 'hint', '4567')))$$),
  '22023', 'a passport needs its country');
select is(
  pg_temp.try($$select pg_temp.set(3, 3, jsonb_build_object('identity',
    jsonb_build_object('kind', 'other', 'sealed', pg_temp.s('11'), 'hint', '4567', 'country', 'ER')))$$),
  '22023', 'another document needs its name');
select is(
  pg_temp.try($$select pg_temp.set(4, 4, jsonb_build_object('identity',
    jsonb_build_object('kind', 'other', 'sealed', pg_temp.s('11'), 'hint', '4567',
      'name_sealed', pg_temp.s('66'))))$$),
  'ok', 'with it, it is kept apart from the number');
select ok(
  (select f.id_name_enc is not null and get_byte(f.id_enc, 0) = 1 and f.id_hint = '4567'
   from pg_temp.file(4) f),
  'sealed, with its hint in the clear'
);
select is(
  pg_temp.try($$select pg_temp.set(1, 1, jsonb_build_object('email', pg_temp.s('aa')))$$),
  '22023', 'and nothing is sealed for someone without a key');

------------------------------------------------------------------------------
-- The bank

-- This year's 101, handed in: a bank change never makes it due again.
insert into public.employee_tax_years (business_id, user_id, tax_year, status, route)
values (pg_temp.a(), pg_temp.p(3), 2026, 'handed_in', 'print');

select is(pg_temp.try($$select pg_temp.set(3, 3, pg_temp.bank('valid'))$$), '55000:step_up',
  'an account waits for a fresh code');
select public.note_step_up(pg_temp.p(3), 'bank', pg_temp.at() - interval '11 minutes');
select is(pg_temp.try($$select pg_temp.set(3, 3, pg_temp.bank('valid'))$$), '55000:step_up',
  'one from more than 10 minutes ago');
select public.note_step_up(pg_temp.p(3), 'bank', pg_temp.at() - interval '2 minutes');
select is(pg_temp.try($$select pg_temp.set(3, 3, pg_temp.bank('valid'))$$), 'ok',
  'and goes in with one');
select ok(
  (select f.bank_review = 'new' and f.bank_changed_at = pg_temp.at() and f.bank_instruction_at = pg_temp.at()
   from pg_temp.file(3) f)
  and not exists (select 1 from private.step_ups s where s.user_id = pg_temp.p(3)),
  'the first account too waits for a holder, and the code is used'
);
select is(pg_temp.try($$select pg_temp.set(3, 3, pg_temp.bank('valid'))$$), '55000:step_up',
  'once');
select public.note_step_up(pg_temp.p(3), 'bank', pg_temp.at());
select pg_temp.set(3, 3, pg_temp.bank('warning'));
select is((select f.bank_review from pg_temp.file(3) f), 'warned',
  'an account whose check warned waits as warned');
select is(
  pg_temp.try($$select pg_temp.set(3, 3, jsonb_build_object('bank', pg_temp.bank('valid') -> 'bank' || '{"instruction": "v0"}'))$$),
  '22023', 'an instruction not on screen is refused');

update auth.users set phone = '972500759999' where id = pg_temp.p(3);
update private.phone_changes set changed_at = pg_temp.at() - interval '3 days'
where user_id = pg_temp.p(3);
select public.note_step_up(pg_temp.p(3), 'bank', pg_temp.at());
select is(pg_temp.try($$select pg_temp.set(3, 3, pg_temp.bank('valid'))$$), '55000:phone_hold',
  'no bank change in the week after a phone change');
-- What the server reads before a code goes (20261126000300_bank_change_hold.sql):
-- the week measured at the time asked, never past it, with the day the
-- refusal names.
select is(public.bank_change_hold(pg_temp.a(), pg_temp.p(3), pg_temp.at()),
  jsonb_build_object('opens_at', pg_temp.at() + interval '4 days', 'opens_on', '2026-11-30'),
  'the week''s end is read, with its day in the business''s zone');
select is(
  public.bank_change_hold(pg_temp.a(), pg_temp.p(3),
    pg_temp.at() + interval '4 days' - interval '5 minutes') ->> 'opens_on',
  '2026-11-30', 'also minutes before it ends');
select is(
  public.bank_change_hold(pg_temp.a(), pg_temp.p(3), pg_temp.at() + interval '4 days'),
  null::jsonb, 'and nothing once it has, as the write measures it');
-- A week ending between midnight and 02:00 in Israel, on another date in
-- UTC: its day there, the one the write's refusal names, with the session
-- in UTC so a day read without the business's zone would differ.
set local timezone = 'UTC';
update private.phone_changes set changed_at = '2026-11-24 00:30+02'::timestamptz
where user_id = pg_temp.p(3);
select is(
  array[
    public.bank_change_hold(pg_temp.a(), pg_temp.p(3), pg_temp.at()) ->> 'opens_on',
    pg_temp.refused_on($$select pg_temp.set(3, 3, pg_temp.bank('valid'))$$)
  ],
  array['2026-12-01', '2026-12-01'],
  'the day in Israel, not in UTC (22:30 UTC on the 30th), as the refusal names it');
reset timezone;
update private.phone_changes set changed_at = pg_temp.at() - interval '8 days'
where user_id = pg_temp.p(3);
select is(pg_temp.try($$select pg_temp.set(3, 3, pg_temp.bank('valid'))$$), 'ok',
  'and after it, one again');
select is(public.bank_change_hold(pg_temp.a(), pg_temp.p(3), pg_temp.at()), null::jsonb,
  'the week read as over too');
update auth.users set phone = '972500759998' where id = pg_temp.p(14);
select is(
  (select count(*)::integer from private.phone_changes c where c.user_id = pg_temp.p(14)),
  0, 'a first number is not a change');
select is(public.bank_change_hold(pg_temp.a(), pg_temp.p(14), pg_temp.at()), null::jsonb,
  'and holds nothing');
select is(pg_temp.try($$select pg_temp.set(3, 3, '{"bank": null}')$$), '55000:step_up',
  'withdrawing the account waits for a fresh code too');
update private.phone_changes set changed_at = pg_temp.at() - interval '3 days'
where user_id = pg_temp.p(3);
select public.note_step_up(pg_temp.p(3), 'bank', pg_temp.at());
select is(pg_temp.try($$select pg_temp.set(3, 3, '{"bank": null}')$$), '55000:phone_hold',
  'and for the week after a phone change');
update private.phone_changes set changed_at = pg_temp.at() - interval '8 days'
where user_id = pg_temp.p(3);
select is(pg_temp.try($$select pg_temp.set(3, 3, '{"bank": null}')$$), 'ok',
  'the person withdraws the account');
select ok(
  (select f.bank_account_enc is null and f.bank_code is null and f.bank_review is null
   from pg_temp.file(3) f)
  and not exists (select 1 from private.step_ups s where s.user_id = pg_temp.p(3)),
  'and it goes whole, the code used'
);
select is(pg_temp.set(4, 4, '{"bank": null}') -> 'changed', '[]'::jsonb,
  'withdrawing no account changes nothing, and needs no code');
select is(
  (select y.status from public.employee_tax_years y
   where y.user_id = pg_temp.p(3) and y.tax_year = 2026),
  'handed_in', 'the account''s changes left the 101 as it was');

------------------------------------------------------------------------------
-- The 101, the birth date and youth

select is(
  pg_temp.try($$select pg_temp.set(3, 3, jsonb_build_object('address',
    jsonb_build_object('city_code', 5000, 'sealed', pg_temp.s('22'))))$$),
  'ok', 'a first address');
select is(
  (select y.status from public.employee_tax_years y
   where y.user_id = pg_temp.p(3) and y.tax_year = 2026),
  'handed_in', 'is no change to the 101');
select is(
  pg_temp.set(3, 3, jsonb_build_object('address',
    jsonb_build_object('city_code', 4000, 'sealed', pg_temp.s('23')), 'change_on', '2026-11-20')) ->> 'change_due_by',
  '2026-11-27', 'a new one makes this year''s 101 due again, 7 days after the change');
select results_eq(
  $$select y.status, y.change_due_by from public.employee_tax_years y
    where y.user_id = pg_temp.p(3) and y.tax_year = 2026$$,
  $$values ('change_due'::text, '2026-11-27'::date)$$,
  'and says so'
);
select results_eq(
  $$select a.details from public.audit_log a
    where a.business_id = pg_temp.a() and a.action = 'employee.tax_year'$$,
  $$values (jsonb_build_object('person', pg_temp.p(3), 'year', 2026, 'status', 'change_due'))$$,
  'logged, never what changed'
);
select is(
  pg_temp.try($$select pg_temp.set(3, 3, jsonb_build_object('address',
    jsonb_build_object('city_code', 4000, 'sealed', pg_temp.s('24')), 'change_on', '2026-11-27'))$$),
  '22023', 'a change is never dated after today');
select pg_temp.set(4, 4, pg_temp.names('Yoav'));
select pg_temp.set(4, 4, pg_temp.names('Yoav B'));
select is(
  (select count(*)::integer from public.employee_tax_years y where y.user_id = pg_temp.p(4)),
  0, 'a change with no 101 this year writes none');

select pg_temp.set(4, 4, '{"birth_date": "2010-05-01"}');
select is(
  (select d.youth_until from public.member_payroll_details d
   where d.business_id = pg_temp.a() and d.user_id = pg_temp.p(4)),
  '2028-05-01'::date, 'a minor''s birth date writes their 18th birthday for payroll');
select pg_temp.set(3, 3, '{"birth_date": "1994-03-01"}');
select ok(
  exists (select 1 from public.member_payroll_details d
    where d.business_id = pg_temp.a() and d.user_id = pg_temp.p(3) and d.youth_until is null),
  'an adult''s none'
);
select pg_temp.set(4, 4, '{"birth_date": null}');
select is(
  (select d.youth_until from public.member_payroll_details d
   where d.business_id = pg_temp.a() and d.user_id = pg_temp.p(4)),
  null::date, 'and taking it away clears it');
select is(
  pg_temp.try($$select public.set_payroll_details(pg_temp.p(1), pg_temp.a(), pg_temp.p(4),
    '{"birth_date": "2010-05-01"}', pg_temp.at())$$),
  'ok', 'payroll still takes a birth date the file doesn''t hold');
select is(
  pg_temp.try($$select public.set_payroll_details(pg_temp.p(1), pg_temp.a(), pg_temp.p(3),
    '{"birth_date": "1994-03-01"}', pg_temp.at())$$),
  '22023:in_file', 'and none once the file holds one');
update public.business_modules set enabled = false
where business_id = pg_temp.a() and module_key = 'employee_files';
select is(
  pg_temp.try($$select public.set_payroll_details(pg_temp.p(1), pg_temp.a(), pg_temp.p(3),
    '{"birth_date": "1994-03-01"}', pg_temp.at())$$),
  'ok', 'unless the file takes no writes (the module off): then nobody could change it there');
update public.business_modules set enabled = true
where business_id = pg_temp.a() and module_key = 'employee_files';
select is(
  pg_temp.try($$select public.set_payroll_details(pg_temp.p(1), pg_temp.a(), pg_temp.p(3),
    '{"payroll_number": "17", "rest_day": 5}', pg_temp.at())$$),
  'ok', 'the rest of payroll''s details as before');

insert into seen values ('details', pg_temp.logged('employee.details', 3));
select is(pg_temp.set(3, 3, pg_temp.names('Noa') || '{"birth_date": "1994-03-01"}') -> 'changed', '[]'::jsonb,
  'what is stored already changes nothing');
select is(pg_temp.logged('employee.details', 3), (select n from seen where what = 'details'),
  'and logs nothing');

------------------------------------------------------------------------------
-- The rest of the file

select is(
  pg_temp.try($$select public.set_emergency_contact(pg_temp.p(3), pg_temp.a(), pg_temp.s('44'), pg_temp.at())$$),
  'ok', 'the person sets their emergency contact');
select ok(exists (select 1 from public.member_emergency_contacts c where c.user_id = pg_temp.p(3)),
  'it is kept');
select public.set_emergency_contact(pg_temp.p(3), pg_temp.a(), null, pg_temp.at());
select ok(not exists (select 1 from public.member_emergency_contacts c where c.user_id = pg_temp.p(3)),
  'and removed');
select is(pg_temp.logged('member.emergency', 3), 2, 'each logged as the team''s, never who');
select is(
  pg_temp.try($$select public.set_emergency_contact(pg_temp.p(10), pg_temp.biz(3), pg_temp.s('44'), pg_temp.at())$$),
  '55000:demo', 'a demo keeps its contacts');

select public.submit_employee_file(pg_temp.p(3), pg_temp.a(), pg_temp.at());
select ok(
  (select f.submitted_at = pg_temp.at() from pg_temp.file(3) f)
  and pg_temp.logged('employee.submit', 3) = 1,
  'the person sends their file'
);

select public.note_step_up(pg_temp.p(4), 'bank', pg_temp.at());
select pg_temp.set(4, 4, pg_temp.bank('valid'));
select is(
  pg_temp.try($$select public.acknowledge_bank(pg_temp.p(4), pg_temp.a(), pg_temp.p(4), pg_temp.at(), pg_temp.at())$$),
  '42501:own', 'nobody confirms their own account');
select is(
  pg_temp.try($$select public.acknowledge_bank(pg_temp.p(2), pg_temp.a(), pg_temp.p(4),
    pg_temp.at() - interval '1 minute', pg_temp.at())$$),
  '40001', 'nor one that changed since it was read');
select is(
  pg_temp.try($$select public.acknowledge_bank(pg_temp.p(2), pg_temp.a(), pg_temp.p(4), pg_temp.at(), pg_temp.at())$$),
  'ok', 'a holder confirms it as read');
select ok(
  (select f.bank_review is null from pg_temp.file(4) f) and pg_temp.logged('employee.bank_ack', 2) = 1,
  'it waits no more, and that is logged'
);
select public.dispute_bank_change(pg_temp.p(4), pg_temp.a(), pg_temp.at());
select ok(
  (select f.bank_review = 'disputed' from pg_temp.file(4) f)
  and pg_temp.logged('employee.bank_disputed', 4) = 1,
  'the person says "לא שיניתי", for a holder to look at'
);

select is(
  pg_temp.try($$select public.set_direct_groups(pg_temp.p(2), pg_temp.a(), pg_temp.p(4), '{pension,identity}', pg_temp.at())$$),
  'ok', 'a holder marks parts handed directly to payroll');
select public.set_direct_groups(pg_temp.p(2), pg_temp.a(), pg_temp.p(4), '{identity,pension}', pg_temp.at());
select results_eq(
  $$select (select f.direct_groups from pg_temp.file(4) f), pg_temp.logged('employee.direct', 2)$$,
  $$values ('{identity,pension}'::text[], 1)$$,
  'in the file''s order, and the same set again writes nothing'
);
select is(
  pg_temp.try($$select public.set_direct_groups(pg_temp.p(2), pg_temp.a(), pg_temp.p(4), '{health}', pg_temp.at())$$),
  '22023', 'only the file''s groups');
select is(
  pg_temp.try($$select public.set_direct_groups(pg_temp.p(4), pg_temp.a(), pg_temp.p(4), '{pension}', pg_temp.at())$$),
  '42501', 'and only a holder marks them');

select is(
  pg_temp.try($$select public.set_tax_year_status(pg_temp.p(4), pg_temp.a(), pg_temp.p(4), 2026::smallint,
    'handed_in', 'link', null, null, pg_temp.at())$$),
  'ok', 'the person hands in this year''s 101 by the link');
select is(
  pg_temp.try($$select public.set_tax_year_status(pg_temp.p(4), pg_temp.a(), pg_temp.p(4), 2026::smallint,
    'accepted', null, null, null, pg_temp.at())$$),
  '42501', 'but doesn''t accept it');
select is(
  pg_temp.try($$select public.set_tax_year_status(pg_temp.p(2), pg_temp.a(), pg_temp.p(4), 2026::smallint,
    'returned', null, null, null, pg_temp.at())$$),
  '22023', 'a holder returns one only saying why');
select is(
  pg_temp.try($$select public.set_tax_year_status(pg_temp.p(2), pg_temp.a(), pg_temp.p(4), 2026::smallint,
    'returned', null, null, 'signature', pg_temp.at())$$),
  'ok', 'with a reason');
select results_eq(
  $$select y.status, y.route, y.returned_reason from public.employee_tax_years y
    where y.user_id = pg_temp.p(4) and y.tax_year = 2026$$,
  $$values ('returned'::text, 'link'::text, 'signature'::text)$$,
  'returned, by the way it came'
);
select is(
  pg_temp.try($$select public.set_tax_year_status(pg_temp.p(2), pg_temp.a(), pg_temp.p(4), 2026::smallint,
    'accepted', null, null, null, pg_temp.at())$$),
  'ok', 'and accepts the next');
select public.set_tax_year_status(pg_temp.p(2), pg_temp.a(), pg_temp.p(4), 2026::smallint,
  null, null, null, null, pg_temp.at());
select ok(
  not exists (select 1 from public.employee_tax_years y where y.user_id = pg_temp.p(4)),
  'and takes a mark off'
);
select results_eq(
  $$select a.details ->> 'status' from public.audit_log a
    where a.business_id = pg_temp.a() and a.action = 'employee.tax_year'
      and a.details ->> 'person' = pg_temp.p(4)::text
    order by a.id$$,
  $$values ('handed_in'::text), ('returned'::text), ('accepted'::text), ('cleared'::text)$$,
  'each mark logged'
);
select is(
  pg_temp.try($$select public.set_tax_year_status(pg_temp.p(4), pg_temp.a(), pg_temp.p(4), 2028::smallint,
    'handed_in', 'link', null, null, pg_temp.at())$$),
  '22023', 'a year far from this one is refused');
select is(
  pg_temp.try($$select public.set_tax_year_status(pg_temp.p(4), pg_temp.a(), pg_temp.p(4), 2026::smallint,
    'change_due', null, '2026-11-24', null, pg_temp.at())$$),
  'ok', 'the person says something changed');
select is(
  (select y.change_due_by from public.employee_tax_years y
   where y.user_id = pg_temp.p(4) and y.tax_year = 2026),
  '2026-12-01'::date, 'due 7 days on');

------------------------------------------------------------------------------
-- Kept

select throws_ok(
  $$delete from public.employee_details e where e.user_id = pg_temp.p(3)$$,
  '42501', 'Files are kept: nothing deletes them', 'nothing deletes a file'
);
select throws_ok(
  $$delete from private.person_keys k where k.user_id = pg_temp.p(3)$$,
  '42501', 'Files are kept: nothing deletes them', 'nor a key'
);
select throws_ok(
  $$delete from public.audit_log a where a.business_id = pg_temp.a()$$,
  '42501', 'The log is kept: nothing deletes it', 'nor the log, even as its owner'
);
set local role service_role;
select throws_ok(
  $$update public.audit_log set action = action where business_id = pg_temp.a()$$,
  '42501', null, 'and the secret key can''t change it'
);
reset role;

select * from finish();
rollback;
