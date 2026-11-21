-- The hiring file (תיק עובד), part 2 of 2: the database (profile H4, issue
-- #82 §2 and §5; Orel's decisions of 8 November 2026 on #1, and decision 4 of
-- §6 answered א: a manager helps on the worker's own phone, and what can't be
-- done in the app goes on paper and a holder marks it "נמסר ישירות לשכר").
-- No screen: H5 is the worker's /me/file, H6 the owner's and accountant's
-- view, H7 Form 101, H8 retention. The module is off in every business, the
-- demo ones included, so nothing here shows until Orel approves those screens.
--
--   the module    employee_files (20261126000100_employee_files_module.sql),
--                 off everywhere, with one key, people.files, in an area of
--                 its own: an owner gives it (by_owner), owners always hold
--                 it, and accountants through their fixed grant
--                 (private.accountant_perms is now clock.payroll and
--                 people.files). Never switched per role.
--   the tables    public.employee_details (one file per business and person:
--                 the legal names, the birth date, the ID's kind, country,
--                 expiry and hint, the city, the bank's code, branch, hint and
--                 holder kind, the pension answer, what was handed directly
--                 to payroll, in the clear; the ID number, another document's
--                 name, the address, the email, the work language, the
--                 account number and a relative holder's name sealed),
--                 public.employee_tax_years (each year's Form 101 as handed
--                 in, accepted, returned or due again, never what changed),
--                 public.member_emergency_contacts (sealed; operations data,
--                 kept apart so managers needn't hold the files). RLS on and
--                 every privilege revoked, service_role's too: nothing selects
--                 them directly, the server's secret key included. Every read
--                 goes through a function below, so no read escapes the log.
--   private       person_keys (each person's data key, wrapped by a key the
--                 server holds: the database only ever sees ciphertext for the
--                 sealed columns), file_acknowledgements (the duties screen,
--                 reg 7(ב)), step_ups (a fresh SMS code the server checked,
--                 for one bank change), phone_changes (from a trigger on
--                 auth.users), file_denials (the refusals each caller logged
--                 today), file_settings (the switch for real values),
--                 audit_guard_runs (the nightly check).
--   sealed        bytes are 0x01 ‖ IV ‖ tag ‖ AES-256-GCM, made and opened in
--                 server code alone (@db/crypto): a trigger refuses any other
--                 first byte, and 0x01 for a person without a key. The demo's
--                 made-up values are 0x00 ‖ UTF-8, which only a demo business
--                 may hold, so no key is committed anywhere.
--   writes        server functions with the secret key, for `actor`, each
--                 refused while the module is off (42501, hint 'off'), in a
--                 closed demo (55000, 'demo'), and in a business that isn't a
--                 demo until Orel opens real values on the production project
--                 (55000, 'not_open'; private.file_settings). The person
--                 writes their own file; a holder of people.files who
--                 confirmed the duties writes the names, the birth date and
--                 the ID (s.14 corrections), also for someone who left, and
--                 only an owner an owner's. The bank is the person's alone,
--                 a new account or the one there withdrawn, after a fresh SMS
--                 code recorded here and never in the week after a phone
--                 change; every new account waits for a holder
--                 (bank_review). A name, ID or address that replaces one makes
--                 this year's 101 due again 7 days on. The birth date writes
--                 youth_until. Each write raises again without the row a
--                 failed check would print, and logs the parts it changed,
--                 never a value or a hint.
--   reads         security-definer functions under the person's own session:
--                 the file, the two numbers revealed one call at a time (30
--                 people an hour, each holder's reveals counted one after
--                 another), the export for payroll, the duties
--                 screen, the completeness status (holders the details,
--                 team.view a count) and the emergency contacts (team.view
--                 and holders). The person reads their own, also after
--                 leaving, unlogged; a holder's read logs employee.view; a
--                 refused one returns its reason and logs employee.view_denied
--                 (20 a day per caller, then one "many"), never raising, so
--                 its row stays. A view session is always refused.
--   the log       employee.* rows are read by people.files holders alone (a
--                 third branch of the members' policy), never by a view
--                 (private.is_private_action), and the nightly job
--                 audit-guard checks the log's triggers and revokes and the
--                 file tables' (private.audit_guard_runs; the console's card
--                 is H6's).
--   payroll       P5 never stored a birth date or an ID; its
--                 set_payroll_details keeps its birth-date path while the
--                 file holds none or takes no writes (the module off, a demo
--                 keeping its made-up files, real values not open), and
--                 refuses once it holds one and takes them (22023, hint
--                 'in_file'). The same advisory lock serializes both.
--   the demo      both demos get made-up files at every reset
--                 (private.seed_demo_files, from their definition's "files"),
--                 the module off; the hosted ones now, with nothing reset.
--
-- Locks, in this order and no other: the person's file
-- (private.file_lock, an advisory lock per business and person), then
-- employee_details, then member_payroll_details, then employee_tax_years,
-- then private.person_keys. No writer takes two people's files. The reads
-- take one advisory lock each and nothing after it but the log and
-- private.file_denials: a holder's view of a person on a day
-- (private.note_file_view), and a holder's reveals in a business
-- (public.reveal_employee_fields), so no cycle is possible.
--
-- It replaces, from their latest versions and with only these changes:
-- private.accountant_perms (20261110000300_payroll_access.sql's) with
-- people.files; private.is_private_action (20261111000200_chat.sql's) with
-- employee.*; the log's members' policy (20261115001000_roles_manage.sql's)
-- with the holders' branch; public.set_payroll_details
-- (20261110000600_payroll_details.sql's) with the lock and the refusal;
-- private.purge_business_records (20261111000700_documents.sql's) with the
-- file's rows; public.reset_demo_business
-- (20261120000400_order_taking_orders_demo.sql's) with the files last; and
-- the check on permission_keys.area (20261117000500_order_taking_menu.sql's)
-- with the new area. Each keeps its signature, so its grants stay; revoked
-- and granted again all the same.

------------------------------------------------------------------------------
-- 1. The module: off everywhere

-- A business made from now on gets its row from apply_template, which writes
-- one for every module key; every one before, here.
insert into public.business_modules (business_id, module_key, enabled)
select b.id, 'employee_files'::public.module_key, false from public.businesses b
on conflict (business_id, module_key) do nothing;

------------------------------------------------------------------------------
-- 2. The area and its key

-- 20261117000500_order_taking_menu.sql's list, with the hiring file.
alter table public.permission_keys
  drop constraint permission_keys_area_check,
  add constraint permission_keys_area_check check (
    area in (
      'scheduling', 'time_clock', 'lists', 'chat', 'order_taking', 'team', 'manage',
      'reservations', 'storefront', 'employee_files'
    )
  );

-- The files (modules/employee_files/manifest.ts;
-- modules/permissions.db.test.ts keeps the two the same): an owner gives it,
-- to a role or a person, as pay; never switched per role.
insert into public.permission_keys (key, module_key, area, default_roles, by_owner, requires, settable)
values (
  'people.files', 'employee_files', 'employee_files', '{}'::public.member_role[],
  true, null, false
);

-- 20261110000300_payroll_access.sql's, with the files (ACCOUNTANT_PERMISSIONS
-- in @domain/modules). holds_perm, my_permissions, businesses_holding and
-- viewed_perms read it, unchanged.
create or replace function private.accountant_perms()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select '{clock.payroll,people.files}'::text[]
$$;

------------------------------------------------------------------------------
-- 3. Real values, closed until Orel opens them

-- One row. While real_values is false, every file write refuses a business
-- that isn't a demo (55000, hint 'not_open'): the module can be switched on
-- from the console, but no real ID or account is taken before the lawyer has
-- read the notices. Orel opens it on the production project alone:
--   update private.file_settings set real_values = true, changed_at = now();
-- Tests open it inside their own transaction.
create table private.file_settings (
  only_row boolean primary key default true check (only_row),
  real_values boolean not null default false,
  changed_at timestamptz
);

insert into private.file_settings default values;

alter table private.file_settings enable row level security;
revoke all on private.file_settings from public, anon, authenticated, service_role;

comment on table private.file_settings is
  'One row: whether businesses that are not demos take real hiring-file values (real_values). Opened by hand on the production project only, after the lawyer.';

create function private.takes_real_files()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.real_values from private.file_settings s where s.only_row), false)
$$;

------------------------------------------------------------------------------
-- 4. The tables

-- One file per business and person: records, as payroll's are, so the key
-- to the membership is `restrict` and nothing deletes a row but the purge.
-- Checks only on the plain columns and on what goes together; the sealed
-- ones are checked by the functions (and by Zod before them). Every write
-- validates first, and raises a failed check again without its DETAIL,
-- which would print the row.
create table public.employee_details (
  business_id uuid not null,
  user_id uuid not null,
  -- As on the ID, for payslips and the 101.
  legal_first_name text
    check (legal_first_name is null or char_length(btrim(legal_first_name)) between 1 and 60),
  legal_last_name text
    check (legal_last_name is null or char_length(btrim(legal_last_name)) between 1 and 60),
  -- Here, never in member_payroll_details, which keeps only youth_until.
  birth_date date,
  id_kind text check (id_kind in ('il', 'passport', 'other')),
  id_country text check (id_country ~ '^[A-Z]{2}$'),
  id_expires_on date,
  -- The number, sealed.
  id_enc bytea,
  -- Another document's name, sealed apart from its number, so the file
  -- shows the name and never the number.
  id_name_enc bytea,
  id_hint text check (id_hint ~ '^[0-9A-Z]{4}$'),
  -- A CBS settlement code (סמל יישוב).
  city_code integer check (city_code between 1 and 9999),
  -- The street or area or P.O. box, the number, apartment and zip, sealed.
  address_enc bytea,
  email_enc bytea,
  work_language_enc bytea,
  bank_code smallint check (bank_code between 1 and 999),
  bank_branch smallint check (bank_branch between 0 and 999),
  bank_account_enc bytea,
  bank_account_hint text check (bank_account_hint ~ '^[0-9]{3,4}$'),
  -- Never which relative.
  bank_holder_kind text check (bank_holder_kind in ('self', 'family')),
  bank_holder_enc bytea,
  bank_instruction_at timestamptz,
  bank_instruction_version text check (bank_instruction_version ~ '^[a-z0-9-]{1,20}$'),
  bank_changed_at timestamptz,
  -- What a holder has to look at: a new account, one that failed its
  -- check, or the person's "לא שיניתי". Null: nothing.
  bank_review text check (bank_review in ('new', 'warned', 'disputed')),
  pension_answer text check (pension_answer in ('existing', 'new', 'employer', 'later')),
  pension_fund text check (pension_fund ~ '^[a-z0-9_]{1,40}$'),
  pension_answered_at timestamptz,
  -- "נמסר ישירות לשכר": parts a holder marked as handed on another way.
  direct_groups text[] not null default '{}'::text[]
    check (direct_groups <@ array['identity', 'address', 'bank', 'pension']),
  submitted_at timestamptz,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (business_id, user_id),
  foreign key (business_id, user_id)
    references public.memberships (business_id, user_id) on delete restrict,
  check ((id_kind is null) = (id_enc is null) and (id_enc is null) = (id_hint is null)),
  check (id_kind = 'other' or id_name_enc is null),
  check (id_kind is distinct from 'other' or id_name_enc is not null),
  check (id_kind is distinct from 'il' or (id_country is null and id_expires_on is null)),
  check (id_kind is distinct from 'passport' or id_country is not null),
  check ((city_code is null) = (address_enc is null)),
  check (
    (bank_account_enc is null) = (bank_code is null)
    and (bank_account_enc is null) = (bank_branch is null)
    and (bank_account_enc is null) = (bank_account_hint is null)
    and (bank_account_enc is null) = (bank_holder_kind is null)
    and (bank_account_enc is null) = (bank_instruction_at is null)
  ),
  check ((bank_holder_kind = 'family') = (bank_holder_enc is not null)),
  check (pension_answer is distinct from 'employer' or pension_fund is null)
);

create index employee_details_updated_by_idx on public.employee_details (updated_by);

-- Each year's Form 101: no row is not handed in. Never what changed.
create table public.employee_tax_years (
  business_id uuid not null,
  user_id uuid not null,
  tax_year smallint not null check (tax_year between 2026 and 2100),
  status text not null check (status in ('handed_in', 'accepted', 'returned', 'change_due')),
  route text check (route in ('link', 'print', 'direct')),
  returned_reason text check (returned_reason in ('attachment', 'signature', 'details', 'other')),
  change_due_by date,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (business_id, user_id, tax_year),
  foreign key (business_id, user_id)
    references public.memberships (business_id, user_id) on delete restrict,
  check ((status = 'returned') = (returned_reason is not null)),
  check ((status = 'change_due') = (change_due_by is not null))
);

create index employee_tax_years_updated_by_idx on public.employee_tax_years (updated_by);

-- Someone to call in an emergency: {"name","phone"} sealed, never the
-- relation. Operations data, outside the file, so managers read it without
-- holding the files.
create table public.member_emergency_contacts (
  business_id uuid not null,
  user_id uuid not null,
  contact_enc bytea not null,
  updated_at timestamptz not null default now(),
  primary key (business_id, user_id),
  foreign key (business_id, user_id)
    references public.memberships (business_id, user_id) on delete restrict
);

-- Each person's data key, wrapped by the server's key `kek_id` names (0x01,
-- IV 12, tag 16, the key 32): 61 bytes. shredded_at is for H8.
create table private.person_keys (
  business_id uuid not null,
  user_id uuid not null,
  kek_id smallint not null check (kek_id > 0),
  wrapped_dek bytea not null check (octet_length(wrapped_dek) = 61),
  created_at timestamptz not null default now(),
  shredded_at timestamptz,
  primary key (business_id, user_id),
  foreign key (business_id, user_id)
    references public.memberships (business_id, user_id) on delete restrict
);

create index person_keys_kek_idx on private.person_keys (kek_id);

-- A holder confirmed the duties screen in this wording (reg 7(ב)).
create table private.file_acknowledgements (
  business_id uuid not null,
  user_id uuid not null,
  version text not null,
  acknowledged_at timestamptz not null default now(),
  primary key (business_id, user_id, version),
  foreign key (business_id, user_id)
    references public.memberships (business_id, user_id) on delete cascade
);

-- A fresh SMS code the server checked, for one change: consumed by it.
create table private.step_ups (
  user_id uuid not null references public.profiles (id) on delete cascade,
  purpose text not null check (purpose in ('bank')),
  verified_at timestamptz not null,
  primary key (user_id, purpose)
);

-- When someone's phone number changed (a first number is not a change).
create table private.phone_changes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  changed_at timestamptz not null default now()
);

create index phone_changes_user_idx on private.phone_changes (user_id, changed_at desc);

-- How many refused reads each caller logged a row for, per day.
create table private.file_denials (
  actor_id uuid not null,
  day date not null,
  denied integer not null default 0,
  primary key (actor_id, day)
);

-- The nightly check of the log's guards: what was missing, or nothing.
create table private.audit_guard_runs (
  id bigint generated always as identity primary key,
  checked_at timestamptz not null default now(),
  problems text[] not null
);

alter table public.employee_details enable row level security;
alter table public.employee_tax_years enable row level security;
alter table public.member_emergency_contacts enable row level security;
alter table private.person_keys enable row level security;
alter table private.file_acknowledgements enable row level security;
alter table private.step_ups enable row level security;
alter table private.phone_changes enable row level security;
alter table private.file_denials enable row level security;
alter table private.audit_guard_runs enable row level security;

-- No policies and no privileges, the secret key's included: every read is a
-- logged function, every write a function too.
revoke all on public.employee_details, public.employee_tax_years,
  public.member_emergency_contacts
  from public, anon, authenticated, service_role;
revoke all on private.person_keys, private.file_acknowledgements, private.step_ups,
  private.phone_changes, private.file_denials, private.audit_guard_runs
  from public, anon, authenticated, service_role;

comment on table public.employee_details is
  'The hiring file, one per business and person: plain names, birth date, the ID''s kind and hint, the city, the bank''s code, branch and hint, the pension; the ID number, another document''s name, the address, email, work language, account number and a relative holder''s name sealed in server code. Nothing selects it, service_role included: read through public.employee_file, reveal_employee_fields and export_employee_files (logged), written through public.set_employee_details and the others; deleted only by a demo reset (private.purge_business_records).';
comment on table public.employee_tax_years is
  'Each year''s Form 101 per person: handed in, accepted, returned with a reason, or due again after a change (never what changed). Read through the file''s functions only; written by public.set_tax_year_status and set_employee_details.';
comment on table public.member_emergency_contacts is
  'Someone to call in an emergency, sealed {"name","phone"}, never the relation. Read through public.team_emergency_contacts (team.view, people.files) and the person''s own file; written by public.set_emergency_contact.';
comment on table private.person_keys is
  'Each person''s data key for the hiring file, wrapped by the server''s key kek_id names. Read and written only through the file''s functions; the server unwraps it.';

------------------------------------------------------------------------------
-- 5. Kept, and sealed

-- Nothing deletes a file or a key but a purge that names the business
-- (private.deleting_allowed: H8's shredding gets its own setting).
create function private.refuse_file_record_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.deleting_allowed(old.business_id, null::uuid) then
    raise exception 'Files are kept: nothing deletes them' using errcode = '42501';
  end if;
  return old;
end;
$$;

create trigger employee_details_kept before delete on public.employee_details
  for each row execute function private.refuse_file_record_delete();
create trigger person_keys_kept before delete on private.person_keys
  for each row execute function private.refuse_file_record_delete();

-- A demo business: its files hold made-up values.
create function private.is_demo_business(business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.demo_businesses x where x.business_id = business)
$$;

-- Whether a sealed column's bytes may be kept for this person: nothing, a
-- value sealed in server code (0x01) for someone with a key, or a demo
-- business's made-up text (0x00).
create function private.sealed_fits(business uuid, person uuid, sealed bytea)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when sealed is null then true
    when octet_length(sealed) = 0 then false
    when get_byte(sealed, 0) = 1 then exists (
      select 1 from private.person_keys k
      where k.business_id = sealed_fits.business and k.user_id = sealed_fits.person
    )
    when get_byte(sealed, 0) = 0 then private.is_demo_business(sealed_fits.business)
    else false
  end
$$;

create function private.check_file_sealed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (
    private.sealed_fits(new.business_id, new.user_id, new.id_enc)
    and private.sealed_fits(new.business_id, new.user_id, new.id_name_enc)
    and private.sealed_fits(new.business_id, new.user_id, new.address_enc)
    and private.sealed_fits(new.business_id, new.user_id, new.email_enc)
    and private.sealed_fits(new.business_id, new.user_id, new.work_language_enc)
    and private.sealed_fits(new.business_id, new.user_id, new.bank_account_enc)
    and private.sealed_fits(new.business_id, new.user_id, new.bank_holder_enc)
  ) then
    raise exception 'Not sealed' using errcode = '22023';
  end if;
  return new;
end;
$$;

create function private.check_contact_sealed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.sealed_fits(new.business_id, new.user_id, new.contact_enc) then
    raise exception 'Not sealed' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger employee_details_sealed before insert or update on public.employee_details
  for each row execute function private.check_file_sealed();
create trigger member_emergency_contacts_sealed
  before insert or update on public.member_emergency_contacts
  for each row execute function private.check_contact_sealed();

------------------------------------------------------------------------------
-- 6. Helpers

-- The duties screen's wording (FILE_DUTIES_VERSION in @domain/employee-file;
-- employee-files.db.test.ts keeps the two the same).
create function private.file_duties_version()
returns text
language sql
immutable
set search_path = ''
as $$
  select '2026-11-v1'::text
$$;

-- The bank instruction's wordings a person may sign (BANK_INSTRUCTION_VERSION).
create function private.bank_instruction_versions()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select '{v1}'::text[]
$$;

-- The parts of a file the business asks for (FILE_GROUPS): every one in H4;
-- H5 reads the module's ask settings here.
create function private.file_groups(business uuid)
returns text[]
language sql
stable
set search_path = ''
as $$
  select '{identity,address,bank,pension}'::text[]
$$;

-- `person` holds people.files in the business (owners always, accountants
-- by their grant; active members only).
create function private.holds_files(business uuid, person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.holds_perm(business, person, 'people.files'::text)
$$;

-- A holder who confirmed the duties screen as it reads now.
create function private.file_ready_holder(business uuid, person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.holds_files(business, person)
    and exists (
      select 1 from private.file_acknowledgements a
      where a.business_id = file_ready_holder.business
        and a.user_id = file_ready_holder.person
        and a.version = private.file_duties_version()
    )
$$;

-- The signed-in person has an open view session in the business, as any role.
create function private.viewing_business(business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.view_sessions v
    where v.staff_id = (select auth.uid())
      and v.business_id = viewing_business.business
      and v.ended_at is null
      and v.expires_at > now()
  )
$$;

-- A demo business that keeps its made-up files: one whose definition
-- doesn't open writes ("fileWrites": true, which no definition says in H4).
create function private.keeps_demo_files(business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.demo_businesses d
    where d.business_id = business
      and d.definition -> 'fileWrites' is distinct from 'true'::jsonb
  )
$$;

-- Null when the business takes file writes; else why not: the module off, a
-- closed demo, or real values not open yet.
create function private.file_open_for(business uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not private.module_enabled(business, 'employee_files'::public.module_key) then 'off'::text
    when private.keeps_demo_files(business) then 'demo'::text
    when private.is_demo_business(business) then null::text
    when not private.takes_real_files() then 'not_open'::text
  end
$$;

-- The same, as the writes refuse it.
create function private.check_file_writes(business uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  closed text := private.file_open_for(business);
begin
  if closed = 'off' then
    raise exception 'The employee file is off here' using errcode = '42501', hint = 'off';
  elsif closed = 'demo' then
    raise exception 'A demo business keeps its made-up files' using errcode = '55000', hint = 'demo';
  elsif closed = 'not_open' then
    raise exception 'Real files are not open yet' using errcode = '55000', hint = 'not_open';
  end if;
end;
$$;

-- An active member of the business, or a refusal (42501).
create function private.check_file_actor(business uuid, actor uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if actor is null or not exists (
    select 1 from public.memberships m
    where m.business_id = business and m.user_id = actor and m.active
  ) then
    raise exception 'Members only' using errcode = '42501';
  end if;
end;
$$;

-- The role of `person`, who has a file only on the staff: not in the team
-- (P0002), or an accountant (22023, hint 'not_staff').
create function private.file_person_role(business uuid, person uuid)
returns public.member_role
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  person_role public.member_role;
begin
  select m.role into person_role
  from public.memberships m
  where m.business_id = business and m.user_id = person;
  if person_role is null then
    raise exception 'Not in the team' using errcode = 'P0002';
  end if;
  if not private.is_staff_role(person_role) then
    raise exception 'An accountant has no file here' using errcode = '22023', hint = 'not_staff';
  end if;
  return person_role;
end;
$$;

-- `actor` may change someone else's file: a holder who confirmed the duties
-- (42501, hint 'ack' for one who hasn't yet), and an owner's only an owner
-- (hint 'owner').
create function private.check_file_holder(
  business uuid,
  actor uuid,
  person_role public.member_role
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.file_ready_holder(business, actor) then
    if private.holds_files(business, actor) then
      raise exception 'Confirm the duties first' using errcode = '42501', hint = 'ack';
    end if;
    raise exception 'The person, or a holder of the files' using errcode = '42501';
  end if;
  if person_role = 'owner' and not private.is_active_owner(business, actor) then
    raise exception 'Only an owner changes an owner''s file' using errcode = '42501', hint = 'owner';
  end if;
end;
$$;

-- The business's day at `at_time`.
create function private.file_today(business uuid, at_time timestamptz)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (coalesce(at_time, now()) at time zone b.timezone)::date
  from public.businesses b
  where b.id = business
$$;

-- The groups of the file still missing: neither filled nor handed directly.
-- Filled: identity is both names, the birth date and the ID; the address,
-- the account; the pension a real answer ('later' is still missing).
create function private.file_missing(business uuid, person uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(g.name order by g.place), '{}'::text[])
  from unnest(private.file_groups(file_missing.business)) with ordinality as g (name, place)
  left join public.employee_details e
    on e.business_id = file_missing.business and e.user_id = file_missing.person
  where not (g.name = any (coalesce(e.direct_groups, '{}'::text[])))
    and not coalesce(
      case g.name
        when 'identity' then e.legal_first_name is not null and e.legal_last_name is not null
          and e.birth_date is not null and e.id_enc is not null
        when 'address' then e.address_enc is not null
        when 'bank' then e.bank_account_enc is not null
        when 'pension' then e.pension_answer in ('existing', 'new', 'employer')
      end,
      false
    )
$$;

-- When the pension answer is due: 60 days after the open period began, while
-- there is none (or 'later') and it wasn't handed directly.
create function private.pension_due_on(business uuid, person uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select p.started_on + 60
  from public.employment_periods p
  left join public.employee_details e
    on e.business_id = p.business_id and e.user_id = p.user_id
  where p.business_id = pension_due_on.business
    and p.user_id = pension_due_on.person
    and p.ended_on is null
    and (e.pension_answer is null or e.pension_answer = 'later')
    and not ('pension' = any (coalesce(e.direct_groups, '{}'::text[])))
  order by p.started_on desc
  limit 1
$$;

-- One writer of a person's file at a time, payroll's birth date among them:
-- the first lock any of them takes.
create function private.file_lock(business uuid, person uuid)
returns void
language sql
set search_path = ''
as $$
  select pg_advisory_xact_lock(
    hashtextextended('file:' || business::text || ':' || person::text, 0)
  )
$$;

-- Whether `value` is an object with no key outside `allowed`.
create function private.file_keys_ok(value jsonb, allowed text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(value) = 'object' then not exists (
      select 1 from jsonb_object_keys(value) as k (name)
      where k.name <> all (allowed)
    )
    else false
  end
$$;

-- A day as the file takes one (YYYY-MM-DD), or a refusal naming the key.
create function private.file_day(value jsonb, what text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  typed text;
begin
  if jsonb_typeof(value) is distinct from 'string' then
    raise exception '% is a day, YYYY-MM-DD', what using errcode = '22023';
  end if;
  typed := value #>> '{}';
  if typed !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception '% is a day, YYYY-MM-DD', what using errcode = '22023';
  end if;
  begin
    return make_date(
      substr(typed, 1, 4)::integer, substr(typed, 6, 2)::integer, substr(typed, 9, 2)::integer
    );
  exception when others then
    raise exception '% is a day, YYYY-MM-DD', what using errcode = '22023';
  end;
end;
$$;

-- A sealed value from a patch: base64 of 0x01 and at least one byte of
-- ciphertext, at most `max_bytes`. Never says what it held.
create function private.sealed_of(value jsonb, max_bytes integer)
returns bytea
language plpgsql
immutable
set search_path = ''
as $$
declare
  typed text;
  raw bytea;
begin
  if jsonb_typeof(value) is distinct from 'string' then
    raise exception 'Not sealed' using errcode = '22023';
  end if;
  typed := value #>> '{}';
  if typed !~ '^[A-Za-z0-9+/]+={0,2}$' then
    raise exception 'Not sealed' using errcode = '22023';
  end if;
  begin
    raw := decode(typed, 'base64');
  exception when others then
    raise exception 'Not sealed' using errcode = '22023';
  end;
  if octet_length(raw) < 30 or octet_length(raw) > max_bytes or get_byte(raw, 0) <> 1 then
    raise exception 'Not sealed' using errcode = '22023';
  end if;
  return raw;
end;
$$;

-- Bytes as the server reads them: base64 on one line (encode wraps at 76).
create function private.sealed_text(value bytea)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(encode(value, 'base64'), chr(10), '')
$$;

-- The plain part of a file, as the reads answer it.
create function private.file_plain(e public.employee_details)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'legal_first_name', e.legal_first_name,
    'legal_last_name', e.legal_last_name,
    'birth_date', e.birth_date,
    'id_kind', e.id_kind,
    'id_country', e.id_country,
    'id_expires_on', e.id_expires_on,
    'id_hint', e.id_hint,
    'city_code', e.city_code,
    'bank_code', e.bank_code,
    'bank_branch', e.bank_branch,
    'bank_account_hint', e.bank_account_hint,
    'bank_holder_kind', e.bank_holder_kind,
    'bank_instruction_at', e.bank_instruction_at,
    'bank_instruction_version', e.bank_instruction_version,
    'bank_changed_at', e.bank_changed_at,
    'bank_review', e.bank_review,
    'pension_answer', e.pension_answer,
    'pension_fund', e.pension_fund,
    'pension_answered_at', e.pension_answered_at,
    'direct_groups', to_jsonb(e.direct_groups),
    'submitted_at', e.submitted_at,
    'updated_at', e.updated_at,
    'has', jsonb_build_object(
      'id', e.id_enc is not null,
      'address', e.address_enc is not null,
      'email', e.email_enc is not null,
      'work_language', e.work_language_enc is not null,
      'bank_account', e.bank_account_enc is not null
    )
  )
$$;

-- Why the signed-in person may not read the business's files as a holder,
-- or null when they may: in a view, not an active member, without
-- people.files, or before the duties screen.
create function private.file_holder_gate(business uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.viewing_business(file_holder_gate.business) then 'viewing'::text
    when not exists (
      select 1 from public.memberships m
      where m.business_id = file_holder_gate.business
        and m.user_id = (select auth.uid())
        and m.active
    ) then 'not_member'::text
    when not private.holds_files(file_holder_gate.business, (select auth.uid())) then 'not_holder'::text
    when not private.file_ready_holder(file_holder_gate.business, (select auth.uid())) then 'ack'::text
  end
$$;

-- Who the signed-in person is to `person`'s file: 'self' (a membership of
-- any state: their access right after leaving too), 'holder', or why not.
-- A view comes first, and someone not on the staff is no more than not a
-- member, so a refusal never says whether they are there.
create function private.file_reader(business uuid, person uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.viewing_business(file_reader.business) then 'viewing'::text
    when exists (
      select 1 from public.memberships m
      where m.business_id = file_reader.business
        and m.user_id = file_reader.person
        and m.user_id = (select auth.uid())
    ) then 'self'::text
    when private.file_holder_gate(file_reader.business) is not null
      then private.file_holder_gate(file_reader.business)
    when exists (
      select 1 from public.memberships m
      where m.business_id = file_reader.business
        and m.user_id = file_reader.person
        and private.is_staff_role(m.role)
    ) then 'holder'::text
    else 'not_member'::text
  end
$$;

-- A refused read, logged as the signed-in person's: employee.view_denied
-- {person, fields, reason}. Never for nobody signed in, a business that
-- isn't there, or a person who isn't in it (a stranger can't fill a log
-- with ids); someone outside the business is told no more than not_member.
-- At most 20 a day per caller, then one row "many", then nothing that day.
create function private.log_file_denial(
  business uuid,
  person uuid,
  denied_fields text[],
  why text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  tz text;
  so_far integer;
  in_business boolean;
begin
  if me is null or not exists (select 1 from public.profiles p where p.id = me) then
    return;
  end if;
  select b.timezone into tz from public.businesses b where b.id = business;
  if not found then
    return;
  end if;
  if person is not null and not exists (
    select 1 from public.memberships m
    where m.business_id = business and m.user_id = person
  ) then
    return;
  end if;
  in_business := exists (
    select 1 from public.memberships m
    where m.business_id = business and m.user_id = me and m.active
  );

  insert into private.file_denials as d (actor_id, day, denied)
  values (me, (now() at time zone tz)::date, 1)
  on conflict (actor_id, day) do update set denied = d.denied + 1
  returning d.denied into so_far;
  if so_far > 21 then
    return;
  end if;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, me, 'employee.view_denied',
    jsonb_strip_nulls(jsonb_build_object(
      'person', person,
      'fields', to_jsonb(denied_fields),
      'reason', case
        when so_far = 21 then 'many'::text
        when in_business or why = 'viewing' then why
        else 'not_member'::text
      end
    ))
  );
end;
$$;

-- A holder's read of a file: employee.view {person, fields: ["file"]}, once
-- per reader, person and business day (two tabs at once write one row).
create function private.note_file_view(business uuid, person uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  tz text;
begin
  select b.timezone into tz from public.businesses b where b.id = business;
  perform pg_advisory_xact_lock(
    hashtextextended('employee.view:' || business::text || ':' || me::text || ':' || person::text, 0)
  );
  if exists (
    select 1 from public.audit_log a
    where a.business_id = business
      and a.actor_id = me
      and a.action = 'employee.view'
      and a.details ->> 'person' = person::text
      and a.details -> 'fields' = '["file"]'::jsonb
      and a.created_at >= (date_trunc('day', now() at time zone tz) at time zone tz)
  ) then
    return;
  end if;
  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, me, 'employee.view',
    jsonb_build_object('person', person, 'fields', jsonb_build_array('file'))
  );
end;
$$;

-- The file as `reader` reads it ('self' or 'holder'): its plain part, the
-- sealed values the screens open (never the ID number or the account), the
-- wrapped key, what is missing, the 18th birthday, the pension's due date
-- and the 101 years.
create function private.file_answer(business uuid, person uuid, reader text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'access', file_answer.reader,
    'demo', private.is_demo_business(file_answer.business),
    'file', (
      select private.file_plain(e) from public.employee_details e
      where e.business_id = file_answer.business and e.user_id = file_answer.person
    ),
    'sealed', (
      select jsonb_build_object(
        'address', private.sealed_text(e.address_enc),
        'email', private.sealed_text(e.email_enc),
        'work_language', private.sealed_text(e.work_language_enc),
        'id_name', private.sealed_text(e.id_name_enc),
        'bank_holder', private.sealed_text(e.bank_holder_enc),
        'emergency', (
          select private.sealed_text(c.contact_enc)
          from public.member_emergency_contacts c
          where c.business_id = file_answer.business and c.user_id = file_answer.person
        )
      )
      from (select 1) as one (n)
      left join public.employee_details e
        on e.business_id = file_answer.business and e.user_id = file_answer.person
    ),
    'key', (
      select jsonb_build_object('kek_id', k.kek_id, 'wrapped_dek', private.sealed_text(k.wrapped_dek))
      from private.person_keys k
      where k.business_id = file_answer.business
        and k.user_id = file_answer.person
        and k.shredded_at is null
    ),
    'missing', to_jsonb(private.file_missing(file_answer.business, file_answer.person)),
    'youth_until', (
      select pd.youth_until from public.member_payroll_details pd
      where pd.business_id = file_answer.business and pd.user_id = file_answer.person
    ),
    'pension_due_on', private.pension_due_on(file_answer.business, file_answer.person),
    'tax_years', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'year', y.tax_year,
          'status', y.status,
          'route', y.route,
          'returned_reason', y.returned_reason,
          'change_due_by', y.change_due_by
        )
        order by y.tax_year desc
      )
      from public.employee_tax_years y
      where y.business_id = file_answer.business and y.user_id = file_answer.person
    ), '[]'::jsonb)
  )
$$;

------------------------------------------------------------------------------
-- 7. Writes, with the secret key, for `actor`

-- The person's data key, made once: `actor` (the person, or a holder who
-- may change their file) offers one the server wrapped (base64 of 61
-- bytes); the first offered is kept, and the stored one comes back, which
-- may be another's: the server always seals with what comes back. A
-- shredded key (H8) is refused (55000, hint 'shredded'). No log row.
create function public.employee_data_key(
  actor uuid,
  business uuid,
  person uuid,
  offered_kek smallint,
  offered_dek text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  person_role public.member_role;
  offered bytea;
  kept private.person_keys%rowtype;
begin
  perform private.check_file_writes(business);
  perform private.check_file_actor(business, actor);
  person_role := private.file_person_role(business, person);
  if person is distinct from actor then
    perform private.check_file_holder(business, actor, person_role);
  end if;

  if offered_kek is null or offered_kek < 1 then
    raise exception 'A key id is a positive number' using errcode = '22023';
  end if;
  offered := private.sealed_of(to_jsonb(offered_dek), 61);
  if octet_length(offered) <> 61 then
    raise exception 'Not a wrapped key' using errcode = '22023';
  end if;

  insert into private.person_keys (business_id, user_id, kek_id, wrapped_dek)
  values (business, person, offered_kek, offered)
  on conflict (business_id, user_id) do nothing;

  select * into kept
  from private.person_keys k
  where k.business_id = business and k.user_id = person;
  if kept.shredded_at is not null then
    raise exception 'This file''s key is gone' using errcode = '55000', hint = 'shredded';
  end if;

  return jsonb_build_object(
    'kek_id', kept.kek_id,
    'wrapped_dek', private.sealed_text(kept.wrapped_dek)
  );
end;
$$;

-- Change a person's file, for `actor`, with the secret key. `patch` holds
-- the groups that change, each present meaning "this changes":
--   names          {"first", "last"}
--   birth_date     "YYYY-MM-DD" | null
--   identity       {"kind": "il"|"passport"|"other", "sealed", "hint",
--                   "country"?, "expires_on"?, "name_sealed"?}
--   address        {"city_code", "sealed"} | null
--   email          sealed | null
--   work_language  sealed | null
--   bank           {"code", "branch", "sealed", "hint", "holder":
--                   "self"|"family", "holder_sealed"?, "instruction",
--                   "check": "valid"|"warning"|"unchecked"} | null
--   pension        {"answer", "fund"?}
--   change_on      "YYYY-MM-DD": when something changed (the business's
--                  today by default), for the 101
-- (sealed: base64 from @db/crypto). The person writes their own while
-- active; a holder who confirmed the duties writes the names, the birth
-- date and the identity (42501 hint 'own' for the rest), also for someone
-- who left; an owner's file only an owner. The bank is the person's, a new
-- account or the one there withdrawn (null), after a fresh code (55000
-- 'step_up', consumed here), never in the week after a phone change (55000
-- 'phone_hold', DETAIL the day it opens); a new account waits for a holder
-- ('warned' when its check warned, else 'new'). A plain
-- group sent as stored changes nothing; a sealed one always changes, since
-- the server sends only what changed. A name, ID or address that replaces
-- one makes this year's 101 due again, 7 days after change_on, when there
-- is a row (employee.tax_year). The birth date writes youth_until. One log
-- row names the groups changed, never a value or a hint; a call that
-- changes nothing writes nothing. Answers {"changed", "change_due_by"}.
create function public.set_employee_details(
  actor uuid,
  business uuid,
  person uuid,
  patch jsonb,
  at_time timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  set_on timestamptz := coalesce(at_time, now());
  tz text;
  local_today date;
  year_now smallint;
  person_role public.member_role;
  by_self boolean := person is not distinct from actor;
  unknown_key text;
  part jsonb;
  was public.employee_details%rowtype;
  became public.employee_details%rowtype;
  changed text[] := '{}'::text[];
  first_typed text;
  last_typed text;
  hint_typed text;
  verified timestamptz;
  phone_changed timestamptz;
  change_day date;
  due_by date;
  new_youth date;
begin
  perform private.check_file_writes(business);
  perform private.check_file_actor(business, actor);
  person_role := private.file_person_role(business, person);

  if jsonb_typeof(patch) is distinct from 'object' then
    raise exception 'The details are an object' using errcode = '22023';
  end if;

  select k into unknown_key
  from jsonb_object_keys(patch) as k
  where k not in (
    'names', 'birth_date', 'identity', 'address', 'email', 'work_language',
    'bank', 'pension', 'change_on'
  )
  limit 1;
  if unknown_key is not null then
    raise exception 'Not a detail of the file: %', unknown_key using errcode = '22023';
  end if;

  if not by_self then
    perform private.check_file_holder(business, actor, person_role);
    -- s.14 corrections: a holder fixes the name, the birth date and the ID;
    -- the rest is the person's own.
    if exists (
      select 1 from jsonb_object_keys(patch) as k
      where k not in ('names', 'birth_date', 'identity', 'change_on')
    ) then
      raise exception 'The person changes this themselves' using errcode = '42501', hint = 'own';
    end if;
  end if;

  select b.timezone, (set_on at time zone b.timezone)::date into tz, local_today
  from public.businesses b
  where b.id = business;
  year_now := extract(year from local_today)::smallint;

  change_day := local_today;
  if patch ? 'change_on' then
    change_day := private.file_day(patch -> 'change_on', 'change_on');
    if change_day > local_today or change_day < (local_today - interval '1 year')::date then
      raise exception 'A change is dated within the last year' using errcode = '22023';
    end if;
  end if;

  perform private.file_lock(business, person);

  select * into was
  from public.employee_details e
  where e.business_id = business and e.user_id = person
  for update;
  became := was;

  if patch ? 'names' then
    part := patch -> 'names';
    if not private.file_keys_ok(part, '{first,last}'::text[])
      or jsonb_typeof(part -> 'first') is distinct from 'string'
      or jsonb_typeof(part -> 'last') is distinct from 'string'
    then
      raise exception 'The names are a first and a last name' using errcode = '22023';
    end if;
    first_typed := btrim(part ->> 'first');
    last_typed := btrim(part ->> 'last');
    if char_length(first_typed) not between 1 and 60
      or char_length(last_typed) not between 1 and 60
      or first_typed ~ '[[:cntrl:]]'
      or last_typed ~ '[[:cntrl:]]'
    then
      raise exception 'A name is 1 to 60 characters on one line' using errcode = '22023';
    end if;
    became.legal_first_name := first_typed;
    became.legal_last_name := last_typed;
    if (became.legal_first_name, became.legal_last_name)
      is distinct from (was.legal_first_name, was.legal_last_name)
    then
      changed := array_append(changed, 'names');
    end if;
  end if;

  if patch ? 'birth_date' then
    if jsonb_typeof(patch -> 'birth_date') = 'null' then
      became.birth_date := null;
    else
      became.birth_date := private.file_day(patch -> 'birth_date', 'birth_date');
      if became.birth_date > local_today
        or became.birth_date < (local_today - interval '100 years')::date
      then
        raise exception 'A birth date is in the last 100 years' using errcode = '22023';
      end if;
    end if;
    if became.birth_date is distinct from was.birth_date then
      changed := array_append(changed, 'birth_date');
    end if;
  end if;

  if patch ? 'identity' then
    part := patch -> 'identity';
    if not private.file_keys_ok(part, '{kind,sealed,hint,country,expires_on,name_sealed}'::text[])
      or jsonb_typeof(part -> 'kind') is distinct from 'string'
      or (part ->> 'kind') not in ('il', 'passport', 'other')
    then
      raise exception 'An identity is a kind, a sealed number and a hint' using errcode = '22023';
    end if;
    hint_typed := case when jsonb_typeof(part -> 'hint') = 'string' then part ->> 'hint' end;
    if hint_typed is null or hint_typed !~ '^[0-9A-Z]{4}$' then
      raise exception 'A hint is the last four characters' using errcode = '22023';
    end if;
    became.id_kind := part ->> 'kind';
    became.id_enc := private.sealed_of(part -> 'sealed', 128);
    became.id_hint := hint_typed;
    became.id_country := null;
    became.id_expires_on := null;
    became.id_name_enc := null;
    if became.id_kind = 'il' then
      if part ? 'country' or part ? 'expires_on' or part ? 'name_sealed' then
        raise exception 'An Israeli ID takes no country, expiry or name' using errcode = '22023';
      end if;
    else
      if part ? 'country' then
        if jsonb_typeof(part -> 'country') is distinct from 'string'
          or (part ->> 'country') !~ '^[A-Z]{2}$'
        then
          raise exception 'A country is two capital letters' using errcode = '22023';
        end if;
        became.id_country := part ->> 'country';
      end if;
      if part ? 'expires_on' then
        became.id_expires_on := private.file_day(part -> 'expires_on', 'expires_on');
        if became.id_expires_on not between '2000-01-01'::date and '2100-12-31'::date then
          raise exception 'An expiry is between 2000 and 2100' using errcode = '22023';
        end if;
      end if;
      if became.id_kind = 'passport' then
        if became.id_country is null then
          raise exception 'A passport needs its country' using errcode = '22023';
        end if;
        if part ? 'name_sealed' then
          raise exception 'A passport takes no name' using errcode = '22023';
        end if;
      else
        if not (part ? 'name_sealed') then
          raise exception 'Another document needs its name' using errcode = '22023';
        end if;
        became.id_name_enc := private.sealed_of(part -> 'name_sealed', 256);
      end if;
    end if;
    changed := array_append(changed, 'identity');
  end if;

  if patch ? 'address' then
    part := patch -> 'address';
    if jsonb_typeof(part) = 'null' then
      became.city_code := null;
      became.address_enc := null;
    else
      if not private.file_keys_ok(part, '{city_code,sealed}'::text[])
        or jsonb_typeof(part -> 'city_code') is distinct from 'number'
        or (part ->> 'city_code') !~ '^[0-9]{1,4}$'
      then
        raise exception 'An address is a city code and a sealed address' using errcode = '22023';
      end if;
      became.city_code := (part ->> 'city_code')::integer;
      if became.city_code < 1 then
        raise exception 'A city code is 1 to 9999' using errcode = '22023';
      end if;
      became.address_enc := private.sealed_of(part -> 'sealed', 2048);
    end if;
    if became.address_enc is not null or was.address_enc is not null then
      changed := array_append(changed, 'address');
    end if;
  end if;

  if patch ? 'email' then
    became.email_enc := case
      when jsonb_typeof(patch -> 'email') = 'null' then null
      else private.sealed_of(patch -> 'email', 512)
    end;
    if became.email_enc is not null or was.email_enc is not null then
      changed := array_append(changed, 'email');
    end if;
  end if;

  if patch ? 'work_language' then
    became.work_language_enc := case
      when jsonb_typeof(patch -> 'work_language') = 'null' then null
      else private.sealed_of(patch -> 'work_language', 256)
    end;
    if became.work_language_enc is not null or was.work_language_enc is not null then
      changed := array_append(changed, 'work_language');
    end if;
  end if;

  if patch ? 'bank' then
    part := patch -> 'bank';
    if jsonb_typeof(part) is distinct from 'null' then
      if not private.file_keys_ok(
          part, '{code,branch,sealed,hint,holder,holder_sealed,instruction,check}'::text[]
        )
        or jsonb_typeof(part -> 'code') is distinct from 'number'
        or (part ->> 'code') !~ '^[0-9]{1,3}$'
        or jsonb_typeof(part -> 'branch') is distinct from 'number'
        or (part ->> 'branch') !~ '^[0-9]{1,3}$'
        or jsonb_typeof(part -> 'hint') is distinct from 'string'
        or (part ->> 'hint') !~ '^[0-9]{3,4}$'
        or jsonb_typeof(part -> 'holder') is distinct from 'string'
        or (part ->> 'holder') not in ('self', 'family')
        or jsonb_typeof(part -> 'instruction') is distinct from 'string'
        or not ((part ->> 'instruction') = any (private.bank_instruction_versions()))
        or jsonb_typeof(part -> 'check') is distinct from 'string'
        or (part ->> 'check') not in ('valid', 'warning', 'unchecked')
      then
        raise exception 'An account is a bank, a branch, a sealed number, a hint, its holder and the instruction'
          using errcode = '22023';
      end if;
      if (part ->> 'code')::integer < 1 then
        raise exception 'A bank code is 1 to 999' using errcode = '22023';
      end if;
      if ((part ->> 'holder') = 'family') is distinct from (part ? 'holder_sealed') then
        raise exception 'A family account names its holder, and only it' using errcode = '22023';
      end if;
    end if;

    -- A new account, or the one there withdrawn (bank: null): the payroll
    -- instruction is the person's own word, so both wait for the checks
    -- below. Withdrawing what isn't there changes nothing and needs none.
    if jsonb_typeof(part) is distinct from 'null' or was.bank_account_enc is not null then
      -- The week after a phone change: the new number may not be the
      -- person's, and the code below would have gone to it.
      select max(pc.changed_at) into phone_changed
      from private.phone_changes pc
      where pc.user_id = person;
      if phone_changed is not null and phone_changed > set_on - interval '7 days' then
        raise exception 'Bank details wait a week after a phone change'
          using errcode = '55000', hint = 'phone_hold',
            detail = to_char(((phone_changed + interval '7 days') at time zone tz)::date, 'YYYY-MM-DD');
      end if;

      -- A fresh code the server checked (public.note_step_up), used once.
      select s.verified_at into verified
      from private.step_ups s
      where s.user_id = actor and s.purpose = 'bank';
      if verified is null or verified < set_on - interval '10 minutes' then
        raise exception 'A fresh code first' using errcode = '55000', hint = 'step_up';
      end if;
      delete from private.step_ups s where s.user_id = actor and s.purpose = 'bank';
    end if;

    if jsonb_typeof(part) = 'null' then
      -- The person withdraws the instruction: the whole account goes.
      if was.bank_account_enc is not null then
        became.bank_code := null;
        became.bank_branch := null;
        became.bank_account_enc := null;
        became.bank_account_hint := null;
        became.bank_holder_kind := null;
        became.bank_holder_enc := null;
        became.bank_instruction_at := null;
        became.bank_instruction_version := null;
        became.bank_review := null;
        became.bank_changed_at := set_on;
        changed := array_append(changed, 'bank');
      end if;
    else
      became.bank_code := (part ->> 'code')::smallint;
      became.bank_branch := (part ->> 'branch')::smallint;
      became.bank_account_enc := private.sealed_of(part -> 'sealed', 128);
      became.bank_account_hint := part ->> 'hint';
      became.bank_holder_kind := part ->> 'holder';
      became.bank_holder_enc := case
        when (part ->> 'holder') = 'family' then private.sealed_of(part -> 'holder_sealed', 512)
      end;
      became.bank_instruction_at := set_on;
      became.bank_instruction_version := part ->> 'instruction';
      became.bank_changed_at := set_on;
      -- Every new account waits for a holder, the first too.
      became.bank_review := case when (part ->> 'check') = 'warning' then 'warned' else 'new' end;
      changed := array_append(changed, 'bank');
    end if;
  end if;

  if patch ? 'pension' then
    part := patch -> 'pension';
    if not private.file_keys_ok(part, '{answer,fund}'::text[])
      or jsonb_typeof(part -> 'answer') is distinct from 'string'
      or (part ->> 'answer') not in ('existing', 'new', 'employer', 'later')
    then
      raise exception 'A pension answer is existing, new, employer or later' using errcode = '22023';
    end if;
    if part ? 'fund' and (
      (part ->> 'answer') not in ('existing', 'new')
      or jsonb_typeof(part -> 'fund') is distinct from 'string'
      or (part ->> 'fund') !~ '^[a-z0-9_]{1,40}$'
    ) then
      raise exception 'A fund goes with an existing or a new one, by its key' using errcode = '22023';
    end if;
    became.pension_answer := part ->> 'answer';
    became.pension_fund := part ->> 'fund';
    if (became.pension_answer, became.pension_fund)
      is distinct from (was.pension_answer, was.pension_fund)
    then
      became.pension_answered_at := set_on;
      changed := array_append(changed, 'pension');
    end if;
  end if;

  if cardinality(changed) = 0 then
    return jsonb_build_object('changed', '[]'::jsonb, 'change_due_by', null);
  end if;

  -- The checks above mean the table's never fire; if one does, it goes
  -- again without its DETAIL, which would print the row.
  begin
    insert into public.employee_details as e (
      business_id, user_id, legal_first_name, legal_last_name, birth_date,
      id_kind, id_country, id_expires_on, id_enc, id_name_enc, id_hint,
      city_code, address_enc, email_enc, work_language_enc,
      bank_code, bank_branch, bank_account_enc, bank_account_hint,
      bank_holder_kind, bank_holder_enc, bank_instruction_at, bank_instruction_version,
      bank_changed_at, bank_review, pension_answer, pension_fund, pension_answered_at,
      updated_by, updated_at
    )
    values (
      business, person, became.legal_first_name, became.legal_last_name, became.birth_date,
      became.id_kind, became.id_country, became.id_expires_on, became.id_enc,
      became.id_name_enc, became.id_hint,
      became.city_code, became.address_enc, became.email_enc, became.work_language_enc,
      became.bank_code, became.bank_branch, became.bank_account_enc, became.bank_account_hint,
      became.bank_holder_kind, became.bank_holder_enc, became.bank_instruction_at,
      became.bank_instruction_version,
      became.bank_changed_at, became.bank_review, became.pension_answer, became.pension_fund,
      became.pension_answered_at,
      actor, set_on
    )
    on conflict (business_id, user_id) do update set
      legal_first_name = excluded.legal_first_name,
      legal_last_name = excluded.legal_last_name,
      birth_date = excluded.birth_date,
      id_kind = excluded.id_kind,
      id_country = excluded.id_country,
      id_expires_on = excluded.id_expires_on,
      id_enc = excluded.id_enc,
      id_name_enc = excluded.id_name_enc,
      id_hint = excluded.id_hint,
      city_code = excluded.city_code,
      address_enc = excluded.address_enc,
      email_enc = excluded.email_enc,
      work_language_enc = excluded.work_language_enc,
      bank_code = excluded.bank_code,
      bank_branch = excluded.bank_branch,
      bank_account_enc = excluded.bank_account_enc,
      bank_account_hint = excluded.bank_account_hint,
      bank_holder_kind = excluded.bank_holder_kind,
      bank_holder_enc = excluded.bank_holder_enc,
      bank_instruction_at = excluded.bank_instruction_at,
      bank_instruction_version = excluded.bank_instruction_version,
      bank_changed_at = excluded.bank_changed_at,
      bank_review = excluded.bank_review,
      pension_answer = excluded.pension_answer,
      pension_fund = excluded.pension_fund,
      pension_answered_at = excluded.pension_answered_at,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;
  exception
    when check_violation then
      raise exception 'A detail of the file breaks a rule' using errcode = '23514';
    when not_null_violation then
      raise exception 'A detail of the file is missing' using errcode = '23502';
    when foreign_key_violation then
      raise exception 'Not in the team' using errcode = '23503';
  end;

  -- The 18th birthday, for payroll and the schedule (P5 keeps nothing else).
  if 'birth_date' = any (changed) then
    new_youth := case
      when (became.birth_date + interval '18 years')::date > local_today
        then (became.birth_date + interval '18 years')::date
    end;
    insert into public.member_payroll_details as pd (
      business_id, user_id, youth_until, updated_by, updated_at
    )
    values (business, person, new_youth, actor, set_on)
    on conflict (business_id, user_id) do update set
      youth_until = excluded.youth_until,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
    where pd.youth_until is distinct from excluded.youth_until;
  end if;

  -- Groups only: never a value, a hint or a digit.
  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, actor, 'employee.details',
    jsonb_build_object('person', person, 'fields', to_jsonb(changed))
  );

  -- A 101 detail that replaced one: this year's form is due again.
  if ('names' = any (changed) and was.legal_first_name is not null)
    or ('identity' = any (changed) and was.id_enc is not null)
    or ('address' = any (changed) and was.address_enc is not null)
  then
    update public.employee_tax_years y
    set status = 'change_due',
      returned_reason = null,
      change_due_by = change_day + 7,
      updated_by = actor,
      updated_at = set_on
    where y.business_id = business
      and y.user_id = person
      and y.tax_year = year_now
      and (y.status, y.change_due_by) is distinct from ('change_due'::text, change_day + 7);
    if found then
      insert into public.audit_log (business_id, actor_id, action, details)
      values (
        business, actor, 'employee.tax_year',
        jsonb_build_object('person', person, 'year', year_now, 'status', 'change_due')
      );
    end if;
    select y.change_due_by into due_by
    from public.employee_tax_years y
    where y.business_id = business
      and y.user_id = person
      and y.tax_year = year_now
      and y.status = 'change_due';
  end if;

  return jsonb_build_object('changed', to_jsonb(changed), 'change_due_by', due_by);
end;
$$;

-- The person's own emergency contact, for `actor`: sealed (base64, at most
-- 512 bytes) or null to remove it. Logged as member.emergency {person}
-- (read at team.view), never who it is.
create function public.set_emergency_contact(
  actor uuid,
  business uuid,
  sealed_contact text default null,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  sealed bytea;
  touched integer;
begin
  perform private.check_file_writes(business);
  perform private.check_file_actor(business, actor);
  perform private.file_person_role(business, actor);

  if sealed_contact is not null then
    sealed := private.sealed_of(to_jsonb(sealed_contact), 512);
  end if;

  perform private.file_lock(business, actor);
  if sealed is null then
    delete from public.member_emergency_contacts c
    where c.business_id = business and c.user_id = actor;
  else
    insert into public.member_emergency_contacts as c (business_id, user_id, contact_enc, updated_at)
    values (business, actor, sealed, coalesce(at_time, now()))
    on conflict (business_id, user_id) do update set
      contact_enc = excluded.contact_enc,
      updated_at = excluded.updated_at;
  end if;
  get diagnostics touched = row_count;

  if touched > 0 then
    insert into public.audit_log (business_id, actor_id, action, details)
    values (business, actor, 'member.emergency', jsonb_build_object('person', actor));
  end if;
end;
$$;

-- The person sends their file (H5's "שליחה"): submitted_at.
create function public.submit_employee_file(
  actor uuid,
  business uuid,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  set_on timestamptz := coalesce(at_time, now());
begin
  perform private.check_file_writes(business);
  perform private.check_file_actor(business, actor);
  perform private.file_person_role(business, actor);

  perform private.file_lock(business, actor);
  insert into public.employee_details as e (business_id, user_id, submitted_at, updated_by, updated_at)
  values (business, actor, set_on, actor, set_on)
  on conflict (business_id, user_id) do update set
    submitted_at = excluded.submitted_at,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (business, actor, 'employee.submit', jsonb_build_object('person', actor));
end;
$$;

-- After the server checked a fresh SMS code (H5): the step-up a bank change
-- needs, used once within 10 minutes. 'bank' only. No log row.
create function public.note_step_up(
  actor uuid,
  step_purpose text,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if step_purpose is distinct from 'bank' then
    raise exception 'A step-up is for a bank change' using errcode = '22023';
  end if;
  if actor is null or not exists (select 1 from public.profiles p where p.id = actor) then
    raise exception 'Unknown person' using errcode = 'P0002';
  end if;
  insert into private.step_ups (user_id, purpose, verified_at)
  values (actor, step_purpose, coalesce(at_time, now()))
  on conflict (user_id, purpose) do update set verified_at = excluded.verified_at;
end;
$$;

-- A holder confirms someone's new account (never their own, 42501 'own'),
-- as it was when the screen read it (`seen_changed_at`; changed since:
-- 40001). Logged employee.bank_ack {person}.
create function public.acknowledge_bank(
  actor uuid,
  business uuid,
  person uuid,
  seen_changed_at timestamptz,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  person_role public.member_role;
  kept public.employee_details%rowtype;
begin
  perform private.check_file_writes(business);
  perform private.check_file_actor(business, actor);
  person_role := private.file_person_role(business, person);
  if person is not distinct from actor then
    raise exception 'Someone else confirms your own account' using errcode = '42501', hint = 'own';
  end if;
  perform private.check_file_holder(business, actor, person_role);

  perform private.file_lock(business, person);
  select * into kept
  from public.employee_details e
  where e.business_id = business and e.user_id = person
  for update;
  if kept.bank_review is null then
    raise exception 'Nothing to confirm' using errcode = '22023';
  end if;
  if kept.bank_changed_at is distinct from seen_changed_at then
    raise exception 'The account changed since it was read' using errcode = '40001';
  end if;

  update public.employee_details e
  set bank_review = null, updated_by = actor, updated_at = coalesce(at_time, now())
  where e.business_id = business and e.user_id = person;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (business, actor, 'employee.bank_ack', jsonb_build_object('person', person));
end;
$$;

-- The person's "לא שיניתי" on their account's last change. Logged
-- employee.bank_disputed {person}.
create function public.dispute_bank_change(
  actor uuid,
  business uuid,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  kept public.employee_details%rowtype;
begin
  perform private.check_file_writes(business);
  perform private.check_file_actor(business, actor);
  perform private.file_person_role(business, actor);

  perform private.file_lock(business, actor);
  select * into kept
  from public.employee_details e
  where e.business_id = business and e.user_id = actor
  for update;
  if kept.bank_changed_at is null then
    raise exception 'No change to the account' using errcode = '22023';
  end if;

  update public.employee_details e
  set bank_review = 'disputed', updated_by = actor, updated_at = coalesce(at_time, now())
  where e.business_id = business and e.user_id = actor;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (business, actor, 'employee.bank_disputed', jsonb_build_object('person', actor));
end;
$$;

-- A holder marks parts of a file "נמסר ישירות לשכר" (any of the business's
-- groups; none takes the mark off). The same set writes nothing. Logged
-- employee.direct {person, groups}.
create function public.set_direct_groups(
  actor uuid,
  business uuid,
  person uuid,
  groups text[],
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  person_role public.member_role;
  was_groups text[];
  new_groups text[];
begin
  perform private.check_file_writes(business);
  perform private.check_file_actor(business, actor);
  person_role := private.file_person_role(business, person);
  perform private.check_file_holder(business, actor, person_role);

  if groups is null or not (groups <@ private.file_groups(business)) then
    raise exception 'Groups of the file only' using errcode = '22023';
  end if;
  select coalesce(
      array_agg(x.g order by array_position(private.file_groups(business), x.g)),
      '{}'::text[]
    )
  into new_groups
  from (select distinct unnest(groups) as g) as x;

  perform private.file_lock(business, person);
  select e.direct_groups into was_groups
  from public.employee_details e
  where e.business_id = business and e.user_id = person
  for update;
  if coalesce(was_groups, '{}'::text[]) = new_groups then
    return;
  end if;

  insert into public.employee_details as e (business_id, user_id, direct_groups, updated_by, updated_at)
  values (business, person, new_groups, actor, coalesce(at_time, now()))
  on conflict (business_id, user_id) do update set
    direct_groups = excluded.direct_groups,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, actor, 'employee.direct',
    jsonb_build_object('person', person, 'groups', to_jsonb(new_groups))
  );
end;
$$;

-- A year's Form 101 (`for_year`, the business's year give or take one). The
-- person marks it handed in (`via_route` link or print) or due again after
-- a change (`changed_on`, due 7 days on); a holder who confirmed the duties
-- marks it handed in (direct too), accepted, returned (`why` from the list),
-- or takes the mark off (`new_status` null). Anything else 42501 or 22023.
-- The same mark writes nothing. Logged employee.tax_year {person, year,
-- status} ('cleared' for a mark taken off). The names stay apart from the
-- table's columns, which the upsert reads.
create function public.set_tax_year_status(
  actor uuid,
  business uuid,
  person uuid,
  for_year smallint,
  new_status text default null,
  via_route text default null,
  changed_on date default null,
  why text default null,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  set_on timestamptz := coalesce(at_time, now());
  local_today date;
  year_now smallint;
  person_role public.member_role;
  by_self boolean := person is not distinct from actor;
  was public.employee_tax_years%rowtype;
  due date;
  logged_status text;
begin
  perform private.check_file_writes(business);
  perform private.check_file_actor(business, actor);
  person_role := private.file_person_role(business, person);

  local_today := private.file_today(business, set_on);
  year_now := extract(year from local_today)::smallint;
  if for_year is null or for_year < year_now - 1 or for_year > year_now + 1
    or for_year < 2026 or for_year > 2100
  then
    raise exception 'A tax year around this one' using errcode = '22023';
  end if;
  if new_status is not null
    and new_status not in ('handed_in', 'accepted', 'returned', 'change_due')
  then
    raise exception 'Not a mark of the 101' using errcode = '22023';
  end if;

  if by_self then
    if new_status is null or new_status not in ('handed_in', 'change_due') then
      raise exception 'A holder of the files marks this' using errcode = '42501';
    end if;
    if new_status = 'handed_in' and (via_route is null or via_route not in ('link', 'print')) then
      raise exception 'Handed in by the link or on paper' using errcode = '22023';
    end if;
  else
    perform private.check_file_holder(business, actor, person_role);
    if new_status = 'change_due' then
      raise exception 'The person says when something changed' using errcode = '42501';
    end if;
    if new_status = 'handed_in'
      and (via_route is null or via_route not in ('link', 'print', 'direct'))
    then
      raise exception 'Handed in by the link, on paper or directly' using errcode = '22023';
    end if;
    if new_status = 'returned'
      and (why is null or why not in ('attachment', 'signature', 'details', 'other'))
    then
      raise exception 'A returned form says why' using errcode = '22023';
    end if;
  end if;

  if new_status = 'change_due' then
    if changed_on is null or changed_on > local_today
      or changed_on < (local_today - interval '1 year')::date
    then
      raise exception 'A change is dated within the last year' using errcode = '22023';
    end if;
    due := changed_on + 7;
  end if;

  perform private.file_lock(business, person);
  select * into was
  from public.employee_tax_years y
  where y.business_id = business and y.user_id = person and y.tax_year = for_year
  for update;

  if new_status is null then
    delete from public.employee_tax_years y
    where y.business_id = business and y.user_id = person and y.tax_year = for_year;
    if not found then
      return;
    end if;
    logged_status := 'cleared';
  else
    insert into public.employee_tax_years as y (
      business_id, user_id, tax_year, status, route, returned_reason, change_due_by,
      updated_by, updated_at
    )
    values (
      business, person, for_year, new_status,
      case when new_status = 'handed_in' then via_route else was.route end,
      case when new_status = 'returned' then why end,
      due, actor, set_on
    )
    on conflict (business_id, user_id, tax_year) do update set
      status = excluded.status,
      route = excluded.route,
      returned_reason = excluded.returned_reason,
      change_due_by = excluded.change_due_by,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
    where (y.status, y.route, y.returned_reason, y.change_due_by)
      is distinct from (excluded.status, excluded.route, excluded.returned_reason, excluded.change_due_by);
    if not found then
      return;
    end if;
    logged_status := new_status;
  end if;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, actor, 'employee.tax_year',
    jsonb_build_object('person', person, 'year', for_year, 'status', logged_status)
  );
end;
$$;

------------------------------------------------------------------------------
-- 8. Reads, with the person's own session

-- Each answers nothing to nobody signed in, and {"access": "denied",
-- "reason": "off"} while the module is off, unlogged; a refusal otherwise
-- returns its reason and logs it (private.log_file_denial), never raising,
-- so its row stays. Volatile: they log, and PostgREST calls them by POST.

-- One file: the person's own (unlogged) or a holder's (employee.view once a
-- day per person), as private.file_answer gives it.
create function public.employee_file(business uuid, person uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  reader text;
begin
  if (select auth.uid()) is null or person is null then
    return null;
  end if;
  if not private.module_enabled(business, 'employee_files'::public.module_key) then
    return jsonb_build_object('access', 'denied', 'reason', 'off');
  end if;
  reader := private.file_reader(business, person);
  if reader not in ('self', 'holder') then
    perform private.log_file_denial(business, person, '{file}'::text[], reader);
    return jsonb_build_object('access', 'denied', 'reason', reader);
  end if;
  if reader = 'holder' then
    perform private.note_file_view(business, person);
  end if;
  return private.file_answer(business, person, reader);
end;
$$;

-- The ID number, the account number or both, sealed, for one person: the
-- same check as the file, and for a holder at most 30 other people revealed
-- in the last hour (the same person again is fine; over it: 'limit',
-- logged), counted under the holder's lock in the business, so parallel
-- calls can't pass it together. A holder's reveal logs employee.view
-- {person, fields} every time; the person's own, nothing. Bad fields are
-- the one refusal that raises (22023).
create function public.reveal_employee_fields(business uuid, person uuid, fields text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  reader text;
  revealed integer;
  wanted text[];
begin
  if fields is null or cardinality(fields) = 0 or not (fields <@ '{id,bank_account}'::text[]) then
    raise exception 'Reveal the ID number, the account number or both' using errcode = '22023';
  end if;
  if me is null or person is null then
    return null;
  end if;
  if not private.module_enabled(business, 'employee_files'::public.module_key) then
    return jsonb_build_object('access', 'denied', 'reason', 'off');
  end if;
  select array_agg(f order by f) into wanted
  from (select distinct unnest(fields) as f) as x;

  reader := private.file_reader(business, person);
  if reader not in ('self', 'holder') then
    perform private.log_file_denial(business, person, wanted, reader);
    return jsonb_build_object('access', 'denied', 'reason', reader);
  end if;

  if reader = 'holder' then
    -- One count at a time per holder and business: parallel reveals would
    -- each count under 30 without seeing the others' rows. The lock holds
    -- to the end, so the next count sees this reveal's row.
    perform pg_advisory_xact_lock(
      hashtextextended('employee.reveal:' || business::text || ':' || me::text, 0)
    );
    select count(distinct a.details ->> 'person')::integer into revealed
    from public.audit_log a
    where a.business_id = business
      and a.actor_id = me
      and a.action = 'employee.view'
      and a.created_at > now() - interval '1 hour'
      and a.details -> 'fields' ?| array['id', 'bank_account']
      and a.details ->> 'person' is distinct from person::text;
    if revealed >= 30 then
      perform private.log_file_denial(business, person, wanted, 'limit');
      return jsonb_build_object('access', 'denied', 'reason', 'limit');
    end if;
    insert into public.audit_log (business_id, actor_id, action, details)
    values (
      business, me, 'employee.view',
      jsonb_build_object('person', person, 'fields', to_jsonb(wanted))
    );
  end if;

  return jsonb_build_object(
    'access', reader,
    'demo', private.is_demo_business(business),
    'sealed', (
      select jsonb_build_object(
        'id', case when 'id' = any (wanted) then private.sealed_text(e.id_enc) end,
        'bank_account', case
          when 'bank_account' = any (wanted) then private.sealed_text(e.bank_account_enc)
        end
      )
      from (select 1) as one (n)
      left join public.employee_details e on e.business_id = business and e.user_id = person
    ),
    'key', (
      select jsonb_build_object('kek_id', k.kek_id, 'wrapped_dek', private.sealed_text(k.wrapped_dek))
      from private.person_keys k
      where k.business_id = business and k.user_id = person and k.shredded_at is null
    )
  );
end;
$$;

-- The one bulk path, for the details for payroll (H6's sheet): ready
-- holders only, never in a view. Every active manager and worker with a
-- file, every sealed value with the key; an account a holder hasn't
-- confirmed stays out, its plain parts too ("bank_held"). One
-- employee.export {people, recipient, held} is written before anything
-- returns. `recipient`: 'provider' (whoever does payroll) or 'own'.
create function public.export_employee_files(business uuid, recipient text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  gate text;
  entries jsonb;
  people_count integer;
  held_count integer;
begin
  if recipient is null or recipient not in ('provider', 'own') then
    raise exception 'For whoever does payroll, or for own use' using errcode = '22023';
  end if;
  if me is null then
    return null;
  end if;
  if not private.module_enabled(business, 'employee_files'::public.module_key) then
    return jsonb_build_object('access', 'denied', 'reason', 'off');
  end if;
  gate := private.file_holder_gate(business);
  if gate is not null then
    perform private.log_file_denial(business, null::uuid, null::text[], gate);
    return jsonb_build_object('access', 'denied', 'reason', gate);
  end if;

  select
    coalesce(jsonb_agg(x.entry order by x.joined, x.user_id), '[]'::jsonb),
    count(*)::integer,
    (count(*) filter (where x.held))::integer
  into entries, people_count, held_count
  from (
    select m.user_id, m.created_at as joined,
      e.bank_review is not null and e.bank_account_enc is not null as held,
      jsonb_build_object(
        'user_id', m.user_id,
        'file', private.file_plain(e) || case
          when e.bank_review is not null and e.bank_account_enc is not null then
            jsonb_build_object(
              'bank_code', null, 'bank_branch', null, 'bank_account_hint', null,
              'bank_holder_kind', null
            )
          else '{}'::jsonb
        end,
        'sealed', jsonb_build_object(
          'id', private.sealed_text(e.id_enc),
          'id_name', private.sealed_text(e.id_name_enc),
          'address', private.sealed_text(e.address_enc),
          'email', private.sealed_text(e.email_enc),
          'work_language', private.sealed_text(e.work_language_enc),
          'bank_account', case
            when e.bank_review is null then private.sealed_text(e.bank_account_enc)
          end,
          'bank_holder', case
            when e.bank_review is null then private.sealed_text(e.bank_holder_enc)
          end
        ),
        'key', case when k.user_id is not null then jsonb_build_object(
          'kek_id', k.kek_id, 'wrapped_dek', private.sealed_text(k.wrapped_dek)
        ) end,
        'missing', to_jsonb(private.file_missing(business, m.user_id)),
        'bank_held', e.bank_review is not null and e.bank_account_enc is not null
      ) as entry
    from public.memberships m
    join public.employee_details e on e.business_id = m.business_id and e.user_id = m.user_id
    left join private.person_keys k
      on k.business_id = m.business_id and k.user_id = m.user_id and k.shredded_at is null
    where m.business_id = business
      and m.active
      and m.role in ('manager', 'worker')
  ) as x;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, me, 'employee.export',
    jsonb_build_object('people', people_count, 'recipient', recipient, 'held', held_count)
  );

  return jsonb_build_object(
    'access', 'holder',
    'demo', private.is_demo_business(business),
    'entries', entries
  );
end;
$$;

-- The duties screen (reg 7(ב)), confirmed by an active holder, never in a
-- view, in the wording now on screen (22023 for another). Logged
-- employee.ack {version} the first time. False for anyone else.
create function public.acknowledge_file_duties(business uuid, duties_version text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  added integer;
begin
  if duties_version is distinct from private.file_duties_version() then
    raise exception 'Not the duties now on screen' using errcode = '22023';
  end if;
  if me is null
    or not private.module_enabled(business, 'employee_files'::public.module_key)
    or private.viewing_business(business)
    or not private.holds_files(business, me)
  then
    return false;
  end if;
  insert into private.file_acknowledgements (business_id, user_id, version)
  values (business, me, duties_version)
  on conflict do nothing;
  get diagnostics added = row_count;
  if added > 0 then
    insert into public.audit_log (business_id, actor_id, action, details)
    values (business, me, 'employee.ack', jsonb_build_object('version', duties_version));
  end if;
  return true;
end;
$$;

-- How complete each active manager's and worker's file is (owners are left
-- out, as for a payroll number), while the module is on. A holder (not in a
-- view) reads every column with `detail`: which groups are missing, this
-- year's 101, the pension's due date, the bank's review, the 18th birthday,
-- when it was sent. Whoever sees the team (team.view, and a view as such a
-- role, as public.team_phones) reads whether it is complete, how many are
-- missing and whether this year's 101 is in, a returned one as not in and
-- one due again as in, so nothing hints at a change in someone's life.
-- Anyone else, nothing. Never a value, a hint or a birth date. Not logged.
create function public.employee_file_status(business uuid)
returns table (
  user_id uuid,
  complete boolean,
  missing integer,
  form101_in boolean,
  detail jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with reader as (
    select
      (select auth.uid()) is not null
        and private.holds_files(employee_file_status.business, (select auth.uid()))
        and not private.viewing_business(employee_file_status.business) as holder,
      employee_file_status.business in (select private.businesses_holding('team.view'::text))
        as team
  ),
  people as (
    select m.user_id,
      private.file_missing(employee_file_status.business, m.user_id) as gaps,
      extract(year from (now() at time zone b.timezone))::integer as tax_year,
      y.status,
      y.returned_reason,
      y.change_due_by,
      e.bank_review,
      e.submitted_at,
      pd.youth_until
    from public.memberships m
    join public.businesses b on b.id = m.business_id
    left join public.employee_details e
      on e.business_id = m.business_id and e.user_id = m.user_id
    left join public.employee_tax_years y
      on y.business_id = m.business_id
      and y.user_id = m.user_id
      and y.tax_year = extract(year from (now() at time zone b.timezone))
    left join public.member_payroll_details pd
      on pd.business_id = m.business_id and pd.user_id = m.user_id
    where m.business_id = employee_file_status.business
      and m.active
      and m.role in ('manager', 'worker')
  )
  select p.user_id,
    cardinality(p.gaps) = 0,
    cardinality(p.gaps),
    coalesce(p.status in ('handed_in', 'accepted', 'change_due'), false),
    case when r.holder then jsonb_build_object(
      'missing', to_jsonb(p.gaps),
      'tax_year', p.tax_year,
      'status', p.status,
      'returned_reason', p.returned_reason,
      'change_due_by', p.change_due_by,
      'pension_due_on', private.pension_due_on(employee_file_status.business, p.user_id),
      'bank_review', p.bank_review,
      'youth_until', p.youth_until,
      'submitted_at', p.submitted_at
    ) end
  from people p
  cross join reader r
  where private.module_enabled(employee_file_status.business, 'employee_files'::public.module_key)
    and (r.holder or r.team)
$$;

-- The emergency contacts of the active staff, sealed, for an active member
-- who sees the team or holds the files (private.holds_perm: never a view),
-- while the module is on. The server opens them. Not logged: operations.
create function public.team_emergency_contacts(business uuid)
returns table (
  user_id uuid,
  contact text,
  kek_id smallint,
  wrapped_dek text,
  demo boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.user_id,
    private.sealed_text(c.contact_enc),
    k.kek_id,
    private.sealed_text(k.wrapped_dek),
    private.is_demo_business(c.business_id)
  from public.member_emergency_contacts c
  join public.memberships m
    on m.business_id = c.business_id and m.user_id = c.user_id and m.active
  left join private.person_keys k
    on k.business_id = c.business_id and k.user_id = c.user_id and k.shredded_at is null
  where c.business_id = team_emergency_contacts.business
    and private.is_staff_role(m.role)
    and private.module_enabled(team_emergency_contacts.business, 'employee_files'::public.module_key)
    and (
      private.holds_perm(team_emergency_contacts.business, (select auth.uid()), 'team.view'::text)
      or private.holds_perm(team_emergency_contacts.business, (select auth.uid()), 'people.files'::text)
    )
$$;

------------------------------------------------------------------------------
-- 9. The log's read rules

-- 20261115001000_roles_manage.sql's, with the files' rows read by holders
-- of people.files alone: kept out of the managers' side as documents' are,
-- and a third side of their own. member.emergency is the team's
-- (private.log_perm), as before.
alter policy "members read the log by area, pay holders the pay rows" on public.audit_log
  using (
    (
      not private.is_pay_action(action)
      and action !~ '^(document|employee)\.'
      and (business_id, 'manage.view'::text) in (
        select h.business_id, h.perm from private.held_perms() h
      )
      and (business_id, private.log_perm(action)) in (
        select h.business_id, h.perm from private.held_perms() h
      )
    )
    or (
      (business_id, 'clock.payroll'::text) in (
        select h.business_id, h.perm from private.held_perms() h
      )
      and (private.is_pay_action(action) or action ~ '^(clock|permission|document)\.')
    )
    or (
      (business_id, 'people.files'::text) in (
        select h.business_id, h.perm from private.held_perms() h
      )
      and action ~ '^employee\.'
    )
  );

-- 20261111000200_chat.sql's, with the files: no view session reads their
-- rows ("a view reads the log as its role would" asks this, unchanged).
create or replace function private.is_private_action(what text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(what ~ '^(chat|document|employee)\.', false)
$$;

comment on table public.audit_log is
  'Append-only record of what changed in a business: written only by server functions, never changed but for its actor going when their account does, deleted only by a demo reset (private.purge_business_records). Read at manage.view, each row by its own area too (private.log_perm: the clock''s at clock.edit, the schedule''s, swaps'' and availability''s at schedule.edit, the lists'' at lists.manage, the team''s at team.view, chat''s at chat.moderate, the management page''s own at manage.view alone, a family named in none of them by no one there); pay rows (wage.*, payroll.*) and rows about documents (document.*) by pay holders only (clock.payroll); the hiring file''s (employee.*) by people.files holders only; rows about chats, documents and the files (chat.*, document.*, employee.*) never by a view session.';

------------------------------------------------------------------------------
-- 10. The log's nightly check

-- What is missing of what keeps the log and the files: each name a problem.
-- The log's two triggers and the files' "kept" ones, present and enabled; no
-- update, delete or truncate on the log for the API's roles; RLS on the
-- file tables, and no privilege on them or on the keys for those roles.
create function private.audit_guard_problems()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  with roles (role) as (
    values ('service_role'::text), ('authenticated'::text), ('anon'::text)
  ),
  problems (problem) as (
    select t.tname
    from (
      values
        ('public.audit_log'::regclass, 'audit_log_kept'::text),
        ('public.audit_log'::regclass, 'audit_log_unchanged'::text),
        ('public.employee_details'::regclass, 'employee_details_kept'::text),
        ('private.person_keys'::regclass, 'person_keys_kept'::text)
    ) as t (rel, tname)
    where not exists (
      select 1 from pg_catalog.pg_trigger g
      where g.tgrelid = t.rel and g.tgname = t.tname and g.tgenabled <> 'D'
    )
    union all
    select 'audit_log:' || r.role || ':' || lower(p.privilege)
    from roles r
    cross join (values ('UPDATE'::text), ('DELETE'::text), ('TRUNCATE'::text)) as p (privilege)
    where has_table_privilege(r.role, 'public.audit_log', p.privilege)
    union all
    select c.relname::text || ':rls'
    from pg_catalog.pg_class c
    where c.oid in (
        'public.employee_details'::regclass,
        'public.employee_tax_years'::regclass,
        'public.member_emergency_contacts'::regclass
      )
      and not c.relrowsecurity
    union all
    select split_part(t.tname, '.', 2) || ':' || r.role
    from (
      values
        ('public.employee_details'::text), ('public.employee_tax_years'::text),
        ('public.member_emergency_contacts'::text), ('private.person_keys'::text)
    ) as t (tname)
    cross join roles r
    where has_table_privilege(
      r.role, t.tname, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
    )
  )
  select coalesce(array_agg(p.problem order by p.problem), '{}'::text[]) from problems p
$$;

-- Once a night (the job audit-guard): a run row with what is missing (none
-- when all holds), and a warning naming it; never an error, which would roll
-- the row back. Old runs go after 400 days, the refusals' counts after 2.
-- The console's card that reads it is H6's.
create function private.audit_guard_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  missing_now text[];
begin
  begin
    missing_now := private.audit_guard_problems();
  exception when others then
    missing_now := array['audit_guard:' || sqlstate];
  end;
  insert into private.audit_guard_runs (problems) values (missing_now);
  delete from private.audit_guard_runs r where r.checked_at < now() - interval '400 days';
  delete from private.file_denials d where d.day < (now() at time zone 'Asia/Jerusalem')::date - 2;
  if cardinality(missing_now) > 0 then
    raise warning 'The log is not guarded: %', array_to_string(missing_now, ', ');
  end if;
end;
$$;

select cron.schedule('audit-guard', '41 2 * * *', $$select private.audit_guard_tick()$$);

-- The newest run, for the console (H6), with the secret key: when it ran
-- and what was missing, or null before the first.
create function public.audit_guard_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('checked_at', r.checked_at, 'problems', to_jsonb(r.problems))
  from private.audit_guard_runs r
  order by r.checked_at desc, r.id desc
  limit 1
$$;

------------------------------------------------------------------------------
-- 11. A phone change, and the week after it

-- Any change of a number, the console's included: a first number is not a
-- change. The bank waits 7 days after one (set_employee_details).
create function public.note_phone_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.phone_changes (user_id) values (new.id);
  return null;
end;
$$;

create trigger on_auth_user_phone_changed
  after update of phone on auth.users
  for each row
  when (coalesce(old.phone, '') <> '' and old.phone is distinct from new.phone)
  execute function public.note_phone_change();

------------------------------------------------------------------------------
-- 12. Payroll's birth date

-- 20261110000600_payroll_details.sql's, with two changes in the birth date's
-- block: it takes the person's file lock first (private.file_lock, as every
-- writer of the file does), and once the file holds a birth date and takes
-- writes (private.file_open_for is null) it refuses one here (22023, hint
-- 'in_file'): the file decides from then on. Until then it works as
-- before, so a business without the file still marks a minor, and so does
-- a demo, whose made-up files hold birth dates nobody can change.
create or replace function public.set_payroll_details(
  actor uuid,
  business uuid,
  person uuid,
  patch jsonb,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  person_role public.member_role;
  set_on timestamptz := coalesce(at_time, now());
  local_today date;
  unknown_key text;
  new_number text;
  new_rest smallint;
  new_law text;
  new_school boolean;
  new_youth date;
  born date;
  was public.member_payroll_details%rowtype;
  became public.member_payroll_details%rowtype;
  changed text[] := '{}'::text[];
begin
  perform private.check_time_clock_on(business);

  if actor is null or not private.holds_perm(business, actor, 'clock.payroll') then
    raise exception 'Pay holders only' using errcode = '42501';
  end if;

  if person is not distinct from actor then
    raise exception 'Someone else sets your own details' using errcode = '42501';
  end if;

  -- Active or not: someone who left is still paid for their last months.
  select m.role into person_role
  from public.memberships m
  where m.business_id = business and m.user_id = person;
  if person_role is null then
    raise exception 'Not in the team' using errcode = 'P0002';
  end if;

  if not private.is_staff_role(person_role) then
    raise exception 'An accountant has no hours here' using errcode = '22023';
  end if;

  if person_role = 'owner' and not private.is_active_owner(business, actor) then
    raise exception 'Only an owner sets an owner''s details' using errcode = '42501';
  end if;

  if jsonb_typeof(patch) is distinct from 'object' then
    raise exception 'The details are an object' using errcode = '22023';
  end if;

  select k into unknown_key
  from jsonb_object_keys(patch) as k
  where k not in (
    'payroll_number', 'rest_day', 'hours_law', 'compulsory_education', 'birth_date'
  )
  limit 1;
  if unknown_key is not null then
    raise exception 'Not a payroll detail: %', unknown_key using errcode = '22023';
  end if;

  if patch ? 'payroll_number' then
    if jsonb_typeof(patch -> 'payroll_number') = 'null' then
      new_number := null;
    elsif jsonb_typeof(patch -> 'payroll_number') = 'string' then
      new_number := nullif(btrim(patch ->> 'payroll_number'), '');
      if new_number is not null and new_number !~ '^[0-9A-Za-z-]{1,20}$' then
        raise exception 'A payroll number is 1 to 20 letters, digits or dashes'
          using errcode = '22023';
      end if;
    else
      raise exception 'A payroll number is text' using errcode = '22023';
    end if;
  end if;

  -- Its value is left to the table's check (23514).
  if patch ? 'rest_day' then
    if jsonb_typeof(patch -> 'rest_day') is distinct from 'number'
      or (patch ->> 'rest_day') !~ '^[0-9]{1,2}$'
    then
      raise exception 'A rest day is a weekday''s number' using errcode = '22023';
    end if;
    new_rest := (patch ->> 'rest_day')::smallint;
  end if;

  if patch ? 'hours_law' then
    if jsonb_typeof(patch -> 'hours_law') is distinct from 'string' then
      raise exception 'Say how the Hours law applies' using errcode = '22023';
    end if;
    new_law := patch ->> 'hours_law';
  end if;

  if patch ? 'compulsory_education' then
    if jsonb_typeof(patch -> 'compulsory_education') is distinct from 'boolean' then
      raise exception 'Say whether they are at school' using errcode = '22023';
    end if;
    new_school := (patch ->> 'compulsory_education')::boolean;
  end if;

  select (set_on at time zone b.timezone)::date into local_today
  from public.businesses b
  where b.id = business;

  -- The birth date: from the circle that will hold the hiring file (an owner,
  -- the accountant), read once, and only the 18th birthday kept.
  if patch ? 'birth_date' then
    -- The file's lock first, as every writer of the file takes it: once the
    -- file holds a birth date and takes writes, it is the file's. While it
    -- takes none (the module off, a demo keeping its made-up files, real
    -- values not open), nobody could change the date there, so this stays
    -- the place to enter one.
    perform private.file_lock(business, person);
    if private.file_open_for(business) is null and exists (
      select 1 from public.employee_details d
      where d.business_id = business and d.user_id = person and d.birth_date is not null
    ) then
      raise exception 'The birth date is kept in the employee file'
        using errcode = '22023', hint = 'in_file';
    end if;
    if not (
      private.is_active_owner(business, actor)
      or exists (
        select 1 from public.memberships m
        where m.business_id = business and m.user_id = actor
          and m.active and m.role = 'accountant'
      )
    ) then
      raise exception 'Only an owner or the accountant enters a birth date'
        using errcode = '42501';
    end if;
    if jsonb_typeof(patch -> 'birth_date') = 'null' then
      new_youth := null;
    else
      if jsonb_typeof(patch -> 'birth_date') is distinct from 'string'
        or (patch ->> 'birth_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      then
        raise exception 'A birth date is a day, YYYY-MM-DD' using errcode = '22023';
      end if;
      begin
        born := (patch ->> 'birth_date')::date;
      exception when datetime_field_overflow or invalid_datetime_format then
        raise exception 'A birth date is a day, YYYY-MM-DD' using errcode = '22023';
      end;
      if born > local_today or born < (local_today - interval '100 years')::date then
        raise exception 'A birth date is in the last 100 years' using errcode = '22023';
      end if;
      new_youth := case
        when (born + interval '18 years')::date > local_today
          then (born + interval '18 years')::date
      end;
    end if;
  end if;

  -- The row, with the table's defaults when there is none yet.
  insert into public.member_payroll_details (business_id, user_id, updated_by, updated_at)
  values (business, person, actor, set_on)
  on conflict (business_id, user_id) do nothing;

  select * into was
  from public.member_payroll_details d
  where d.business_id = business and d.user_id = person
  for update;

  became := was;
  if patch ? 'payroll_number' then
    became.payroll_number := new_number;
  end if;
  if patch ? 'rest_day' then
    became.rest_day := new_rest;
  end if;
  if patch ? 'hours_law' then
    became.hours_law := new_law;
  end if;
  if patch ? 'compulsory_education' then
    became.compulsory_education := new_school;
  end if;
  if patch ? 'birth_date' then
    became.youth_until := new_youth;
  end if;

  if became.payroll_number is distinct from was.payroll_number then
    changed := array_append(changed, 'payroll_number');
  end if;
  if became.rest_day is distinct from was.rest_day then
    changed := array_append(changed, 'rest_day');
  end if;
  if became.hours_law is distinct from was.hours_law then
    changed := array_append(changed, 'hours_law');
  end if;
  if became.compulsory_education is distinct from was.compulsory_education then
    changed := array_append(changed, 'compulsory_education');
  end if;
  if became.youth_until is distinct from was.youth_until then
    changed := array_append(changed, 'youth_until');
  end if;

  if cardinality(changed) = 0 then
    return;
  end if;

  update public.member_payroll_details d
  set payroll_number = became.payroll_number,
    rest_day = became.rest_day,
    hours_law = became.hours_law,
    compulsory_education = became.compulsory_education,
    youth_until = became.youth_until,
    updated_by = actor,
    updated_at = set_on
  where d.business_id = business and d.user_id = person;

  -- Field names only: no number, no day, no rest day's value.
  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, actor, 'payroll.details',
    jsonb_build_object('person', person, 'fields', to_jsonb(changed))
  );
end;
$$;

------------------------------------------------------------------------------
-- 13. The demo

-- A demo value: 0x00 and the text, which only a demo business may hold
-- (private.check_file_sealed) and @db/crypto reads only for a demo's read.
create function private.demo_sealed(plain text)
returns bytea
language sql
stable
set search_path = ''
as $$
  select decode('00', 'hex') || convert_to(plain, 'UTF8')
$$;

-- Whether the definition's "files" cases name this case for this person.
create function private.demo_file_case(plan_cases jsonb, person uuid, which text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    plan_cases @> jsonb_build_array(jsonb_build_object('user_id', person::text, 'case', which)),
    false
  )
$$;

-- A demo business's files, as its definition's "files" says:
--   {"cases": [{"user_id": "…", "case": "bank_new"}, …]}
-- Every active manager and worker gets a complete file of made-up values in
-- the demo format (0x00 then UTF-8, no person_keys row), in the definition's
-- order: the legal names from their name (its first word, the rest); an ID
-- from the test range below; a birth date in the 1990s, or a minor's from
-- their youth_until (P5's "youth"); a street address in the business's
-- Shabbat city; an email at demo.conceptapp.invalid; a Hapoalim account
-- that @domain/bank-account checks valid (tooling/demo-files.test.ts holds
-- the lists below to both); the pension an existing fund; sent a month ago;
-- this year's 101 handed in on paper. The cases, each on the person it
-- names:
--   no_file             nothing at all
--   no_bank             no account
--   bank_new            an account changed two days ago, for a holder to confirm
--   bank_warned         an account that fails its check, for a holder to look at
--   passport            a Philippine passport instead of an Israeli ID
--   direct_pension      the pension handed directly to payroll, no answer
--   form101_missing     no 101 this year
--   form101_returned    this year's 101 returned for its signature
--   form101_change_due  this year's 101 due again in 5 days
--   emergency           an emergency contact
-- Set by the definition's first owner, with no log rows: the demo starts
-- with them. Whatever goes wrong here, the reset still stands.
create function private.seed_demo_files(business uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  files_plan jsonb;
  plan_cases jsonb;
  tz text;
  city integer;
  local_today date;
  year_now smallint;
  setter uuid;
  -- Valid Israeli IDs from the test range (check digit and all).
  demo_ids text[] := array[
    '000000018', '000000026', '000000034', '000000042', '000000059',
    '000000067', '000000075', '000000083', '000000091'
  ];
  -- Bank Hapoalim (12), branch 600: accounts that check valid, and one that doesn't.
  demo_accounts text[] := array[
    '100001', '100006', '100008', '100014', '100016',
    '100018', '100022', '100024', '100026'
  ];
  warned_account text := '100002';
begin
  select d.definition -> 'files' into files_plan
  from private.demo_businesses d
  where d.business_id = business;
  if jsonb_typeof(files_plan) is distinct from 'object' then
    return;
  end if;

  begin
    select b.timezone,
      case b.shabbat_city
        when 'jerusalem' then 3000
        when 'haifa' then 4000
        when 'petahTikva' then 7900
        when 'tiberias' then 6700
        when 'ashdod' then 70
        when 'beerSheva' then 9000
        when 'eilat' then 2600
        else 5000
      end
    into tz, city
    from public.businesses b
    where b.id = business;
    if tz is null then
      return;
    end if;
    local_today := (now() at time zone tz)::date;
    year_now := extract(year from local_today)::smallint;
    plan_cases := case
      when jsonb_typeof(files_plan -> 'cases') = 'array' then files_plan -> 'cases'
      else '[]'::jsonb
    end;

    select m.user_id into setter
    from private.demo_businesses d
    cross join lateral jsonb_array_elements(d.definition -> 'people')
      with ordinality as p (value, ordinality)
    join public.memberships m
      on m.business_id = business and m.user_id::text = p.value ->> 'user_id' and m.active
    where d.business_id = business and m.role = 'owner'
    order by p.ordinality
    limit 1;

    insert into public.employee_details (
      business_id, user_id, legal_first_name, legal_last_name, birth_date,
      id_kind, id_country, id_expires_on, id_enc, id_hint,
      city_code, address_enc, email_enc,
      bank_code, bank_branch, bank_account_enc, bank_account_hint, bank_holder_kind,
      bank_instruction_at, bank_instruction_version, bank_changed_at, bank_review,
      pension_answer, pension_fund, pension_answered_at, direct_groups,
      submitted_at, updated_by, updated_at
    )
    select business, s.user_id,
      split_part(s.full_name, ' ', 1),
      nullif(btrim(substr(s.full_name, char_length(split_part(s.full_name, ' ', 1)) + 1)), ''),
      coalesce(
        (pd.youth_until - interval '18 years')::date,
        make_date(1990 + (s.place - 1) % 10, 1 + (s.place * 5) % 12, 1 + (s.place * 7) % 28)
      ),
      case when s.passport then 'passport' else 'il' end,
      case when s.passport then 'PH' end,
      case when s.passport then make_date(year_now + 5, 6, 30) end,
      private.demo_sealed(case
        when s.passport then 'P' || lpad(s.place::text, 7, '0')
        else demo_ids[1 + (s.place - 1) % 9]
      end),
      right(case
        when s.passport then 'P' || lpad(s.place::text, 7, '0')
        else demo_ids[1 + (s.place - 1) % 9]
      end, 4),
      city,
      private.demo_sealed(
        jsonb_build_object('kind', 'street', 'street', 'רחוב הדגמה', 'number', s.place::text)::text
      ),
      private.demo_sealed(s.place::text || '@demo.conceptapp.invalid'),
      case when not s.no_bank then 12 end,
      case when not s.no_bank then 600 end,
      case when not s.no_bank then private.demo_sealed(
        case when s.bank_warned then warned_account else demo_accounts[1 + (s.place - 1) % 9] end
      ) end,
      case when not s.no_bank then right(
        case when s.bank_warned then warned_account else demo_accounts[1 + (s.place - 1) % 9] end, 4
      ) end,
      case when not s.no_bank then 'self' end,
      case when not s.no_bank then
        case when s.bank_new then now() - interval '2 days' else now() - interval '60 days' end
      end,
      case when not s.no_bank then 'v1' end,
      case when not s.no_bank then
        case when s.bank_new then now() - interval '2 days' else now() - interval '60 days' end
      end,
      case
        when s.no_bank then null
        when s.bank_new then 'new'
        when s.bank_warned then 'warned'
      end,
      case when not s.direct_pension then 'existing' end,
      case when not s.direct_pension then 'unknown' end,
      case when not s.direct_pension then now() - interval '30 days' end,
      case when s.direct_pension then '{pension}'::text[] else '{}'::text[] end,
      now() - interval '30 days',
      setter,
      now()
    from (
      select m.user_id,
        p.value ->> 'name' as full_name,
        (row_number() over (order by p.ordinality))::integer as place,
        private.demo_file_case(plan_cases, m.user_id, 'no_file') as no_file,
        private.demo_file_case(plan_cases, m.user_id, 'no_bank') as no_bank,
        private.demo_file_case(plan_cases, m.user_id, 'bank_new') as bank_new,
        private.demo_file_case(plan_cases, m.user_id, 'bank_warned') as bank_warned,
        private.demo_file_case(plan_cases, m.user_id, 'passport') as passport,
        private.demo_file_case(plan_cases, m.user_id, 'direct_pension') as direct_pension
      from private.demo_businesses d
      cross join lateral jsonb_array_elements(d.definition -> 'people')
        with ordinality as p (value, ordinality)
      join public.memberships m
        on m.business_id = business and m.user_id::text = p.value ->> 'user_id' and m.active
      where d.business_id = business and m.role in ('manager', 'worker')
    ) as s
    left join public.member_payroll_details pd
      on pd.business_id = business and pd.user_id = s.user_id
    where not s.no_file
    on conflict (business_id, user_id) do nothing;

    insert into public.employee_tax_years (
      business_id, user_id, tax_year, status, route, returned_reason, change_due_by,
      updated_by, updated_at
    )
    select e.business_id, e.user_id, year_now,
      case
        when private.demo_file_case(plan_cases, e.user_id, 'form101_returned') then 'returned'
        when private.demo_file_case(plan_cases, e.user_id, 'form101_change_due') then 'change_due'
        else 'handed_in'
      end,
      'print',
      case
        when private.demo_file_case(plan_cases, e.user_id, 'form101_returned') then 'signature'
      end,
      case
        when private.demo_file_case(plan_cases, e.user_id, 'form101_change_due') then local_today + 5
      end,
      setter, now()
    from public.employee_details e
    where e.business_id = business
      and not private.demo_file_case(plan_cases, e.user_id, 'form101_missing')
    on conflict (business_id, user_id, tax_year) do nothing;

    insert into public.member_emergency_contacts (business_id, user_id, contact_enc, updated_at)
    select e.business_id, e.user_id,
      private.demo_sealed(
        jsonb_build_object('name', 'איש קשר להדגמה', 'phone', '+972500000999')::text
      ),
      now()
    from public.employee_details e
    where e.business_id = business
      and private.demo_file_case(plan_cases, e.user_id, 'emergency')
    on conflict (business_id, user_id) do nothing;
  exception when others then
    raise warning 'The demo''s files were not written: %', sqlstate;
  end;
end;
$$;

-- The demo reset's purge: 20261111000700_documents.sql's, with the file's
-- rows (its years, the contacts, the files, the duties confirmed, the keys)
-- before the log.
create or replace function private.purge_business_records(business uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior text := current_setting('ca.records_purge', true);
begin
  if business is null then
    return;
  end if;
  perform set_config('ca.records_purge', business::text, true);
  delete from public.time_breaks b where b.business_id = business;
  delete from public.time_entries e where e.business_id = business;
  delete from public.member_wages w where w.business_id = business;
  delete from public.member_payroll_details d where d.business_id = business;
  delete from public.employment_periods p where p.business_id = business;
  delete from public.payroll_months pm where pm.business_id = business;
  delete from public.document_recipients r where r.business_id = business;
  delete from public.documents doc where doc.business_id = business;
  delete from public.employee_tax_years ty where ty.business_id = business;
  delete from public.member_emergency_contacts ec where ec.business_id = business;
  delete from public.employee_details ed where ed.business_id = business;
  delete from private.file_acknowledgements fa where fa.business_id = business;
  delete from private.person_keys pk where pk.business_id = business;
  delete from public.audit_log a where a.business_id = business;
  perform set_config('ca.records_purge', coalesce(prior, ''), true);
end;
$$;

-- The reset: 20261120000400_order_taking_orders_demo.sql's, with the files
-- last (after the pay seed, whose youth_until the minor's birth date reads).
create or replace function public.reset_demo_business(business uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  def jsonb;
begin
  select d.definition into def
  from private.demo_businesses d
  where d.business_id = business
  for update;
  if not found then
    raise exception 'Not a demo business: %', business using errcode = 'P0002';
  end if;

  -- Lock the business before the purge: a write already under way for it (a
  -- visitor's clock-in, anything that logs) finishes first, so the purge sees
  -- its rows, and a new one waits for the reset. The restrict keys then never
  -- meet a row the purge missed.
  perform 1 from public.businesses b where b.id = business for update;

  perform private.purge_business_records(business);
  delete from public.businesses b where b.id = business;

  insert into public.businesses (id, slug, name, accent, address, shabbat_city)
  values (
    business, def ->> 'slug', def ->> 'name', def ->> 'accent',
    def ->> 'address', def ->> 'shabbat_city'
  );
  perform public.apply_template(business, def ->> 'template');

  insert into public.memberships (business_id, user_id, role)
  select business, person.user_id, person.role
  from jsonb_to_recordset(def -> 'people')
    as person (user_id uuid, role public.member_role, name text)
  join public.profiles p on p.id = person.user_id;

  insert into public.department_members (department_id, business_id, user_id)
  select distinct dep.id, business, person.user_id
  from jsonb_to_recordset(def -> 'people')
    as person (user_id uuid, role public.member_role, name text, departments text[])
  join public.memberships m on m.business_id = business and m.user_id = person.user_id
  cross join lateral unnest(coalesce(person.departments, '{}'::text[])) as wanted (key)
  join public.departments dep
    on dep.business_id = business and dep.key = wanted.key and dep.archived_at is null;

  update public.profiles p
  set full_name = person.name, locale = 'he', avatar_path = null,
    bio = null, cover = null, address_form = null
  from jsonb_to_recordset(def -> 'people')
    as person (user_id uuid, role public.member_role, name text)
  where p.id = person.user_id;

  update private.demo_businesses d
  set reset_at = now()
  where d.business_id = business;

  if coalesce((def ->> 'renews')::boolean, false) then
    perform private.renew_demo_schedule(business);
  end if;

  perform private.seed_demo_lists(business);
  perform private.seed_demo_pay(business);
  perform private.seed_demo_chat(business);
  perform private.seed_demo_order_taking(business);
  perform private.seed_demo_orders(business);
  perform private.seed_demo_files(business);
end;
$$;

-- The hosted demo businesses, by their fixed ids (supabase/hosted-demo.sql
-- says the same, for the workflow's "demo" step): in the restaurant, Noa
-- with an emergency contact and Yoav without an account or this year's 101;
-- in the shop, Tamar's new account for a holder, Itai's passport and his
-- 101 returned, Roni's 101 due again and his contact, and Liya's pension
-- handed directly. Their files are written now, with nothing reset (a
-- business that has files is left as it is); locally the seed runs after
-- the migrations, with its own.
update private.demo_businesses d
set definition = d.definition || $json$
  {"files": {"cases": [
    {"user_id": "10000000-0000-4000-a000-000000000104", "case": "emergency"},
    {"user_id": "10000000-0000-4000-a000-000000000105", "case": "no_bank"},
    {"user_id": "10000000-0000-4000-a000-000000000105", "case": "form101_missing"}
  ]}}
  $json$::jsonb
where d.business_id = '10000000-0000-4000-b000-000000000001';

update private.demo_businesses d
set definition = d.definition || $json$
  {"files": {"cases": [
    {"user_id": "10000000-0000-4000-a000-000000000108", "case": "bank_new"},
    {"user_id": "10000000-0000-4000-a000-000000000109", "case": "passport"},
    {"user_id": "10000000-0000-4000-a000-000000000109", "case": "form101_returned"},
    {"user_id": "10000000-0000-4000-a000-000000000110", "case": "form101_change_due"},
    {"user_id": "10000000-0000-4000-a000-000000000110", "case": "emergency"},
    {"user_id": "10000000-0000-4000-a000-000000000111", "case": "direct_pension"}
  ]}}
  $json$::jsonb
where d.business_id = '10000000-0000-4000-b000-000000000002';

select private.seed_demo_files(d.business_id)
from private.demo_businesses d
join public.businesses b on b.id = d.business_id
where not exists (
  select 1 from public.employee_details e where e.business_id = d.business_id
);

------------------------------------------------------------------------------
-- Who may call what

-- The writes and the guard's status: the secret key only, for `actor`.
revoke execute on function public.employee_data_key(uuid, uuid, uuid, smallint, text)
  from public, anon, authenticated;
grant execute on function public.employee_data_key(uuid, uuid, uuid, smallint, text)
  to service_role;
revoke execute on function public.set_employee_details(uuid, uuid, uuid, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.set_employee_details(uuid, uuid, uuid, jsonb, timestamptz)
  to service_role;
revoke execute on function public.set_emergency_contact(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.set_emergency_contact(uuid, uuid, text, timestamptz)
  to service_role;
revoke execute on function public.submit_employee_file(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.submit_employee_file(uuid, uuid, timestamptz)
  to service_role;
revoke execute on function public.note_step_up(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.note_step_up(uuid, text, timestamptz)
  to service_role;
revoke execute on function public.acknowledge_bank(uuid, uuid, uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.acknowledge_bank(uuid, uuid, uuid, timestamptz, timestamptz)
  to service_role;
revoke execute on function public.dispute_bank_change(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.dispute_bank_change(uuid, uuid, timestamptz)
  to service_role;
revoke execute on function public.set_direct_groups(uuid, uuid, uuid, text[], timestamptz)
  from public, anon, authenticated;
grant execute on function public.set_direct_groups(uuid, uuid, uuid, text[], timestamptz)
  to service_role;
revoke execute on function public.set_tax_year_status(uuid, uuid, uuid, smallint, text, text, date, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.set_tax_year_status(uuid, uuid, uuid, smallint, text, text, date, text, timestamptz)
  to service_role;
revoke execute on function public.audit_guard_status() from public, anon, authenticated;
grant execute on function public.audit_guard_status() to service_role;

-- The reads: with the person's own session, never signed out.
revoke execute on function public.employee_file(uuid, uuid) from public, anon;
grant execute on function public.employee_file(uuid, uuid) to authenticated;
revoke execute on function public.reveal_employee_fields(uuid, uuid, text[]) from public, anon;
grant execute on function public.reveal_employee_fields(uuid, uuid, text[]) to authenticated;
revoke execute on function public.export_employee_files(uuid, text) from public, anon;
grant execute on function public.export_employee_files(uuid, text) to authenticated;
revoke execute on function public.acknowledge_file_duties(uuid, text) from public, anon;
grant execute on function public.acknowledge_file_duties(uuid, text) to authenticated;
revoke execute on function public.employee_file_status(uuid) from public, anon;
grant execute on function public.employee_file_status(uuid) to authenticated;
revoke execute on function public.team_emergency_contacts(uuid) from public, anon;
grant execute on function public.team_emergency_contacts(uuid) to authenticated;

-- The trigger's, as handle_new_user's: run by the trigger alone.
revoke execute on function public.note_phone_change() from public, anon, authenticated;

-- The rest run inside the functions, triggers, reset and job above, as their
-- owner.
revoke execute on function private.takes_real_files() from public, anon, authenticated;
revoke execute on function private.refuse_file_record_delete() from public, anon, authenticated;
revoke execute on function private.is_demo_business(uuid) from public, anon, authenticated;
revoke execute on function private.sealed_fits(uuid, uuid, bytea) from public, anon, authenticated;
revoke execute on function private.check_file_sealed() from public, anon, authenticated;
revoke execute on function private.check_contact_sealed() from public, anon, authenticated;
revoke execute on function private.file_duties_version() from public, anon, authenticated;
revoke execute on function private.bank_instruction_versions() from public, anon, authenticated;
revoke execute on function private.file_groups(uuid) from public, anon, authenticated;
revoke execute on function private.holds_files(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.file_ready_holder(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.viewing_business(uuid) from public, anon, authenticated;
revoke execute on function private.keeps_demo_files(uuid) from public, anon, authenticated;
revoke execute on function private.file_open_for(uuid) from public, anon, authenticated;
revoke execute on function private.check_file_writes(uuid) from public, anon, authenticated;
revoke execute on function private.check_file_actor(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.file_person_role(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.check_file_holder(uuid, uuid, public.member_role)
  from public, anon, authenticated;
revoke execute on function private.file_today(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function private.file_missing(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.pension_due_on(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.file_lock(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.file_keys_ok(jsonb, text[]) from public, anon, authenticated;
revoke execute on function private.file_day(jsonb, text) from public, anon, authenticated;
revoke execute on function private.sealed_of(jsonb, integer) from public, anon, authenticated;
revoke execute on function private.sealed_text(bytea) from public, anon, authenticated;
revoke execute on function private.file_plain(public.employee_details) from public, anon, authenticated;
revoke execute on function private.file_holder_gate(uuid) from public, anon, authenticated;
revoke execute on function private.file_reader(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.log_file_denial(uuid, uuid, text[], text)
  from public, anon, authenticated;
revoke execute on function private.note_file_view(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.file_answer(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function private.audit_guard_problems() from public, anon, authenticated;
revoke execute on function private.audit_guard_tick() from public, anon, authenticated;
revoke execute on function private.demo_sealed(text) from public, anon, authenticated, service_role;
revoke execute on function private.demo_file_case(jsonb, uuid, text)
  from public, anon, authenticated, service_role;
revoke execute on function private.seed_demo_files(uuid)
  from public, anon, authenticated, service_role;

-- Replaced in place, the same signatures, so their grants stay; revoked and
-- granted again all the same. The log's view policy asks
-- private.is_private_action as the reader, as before.
revoke execute on function private.accountant_perms() from public, anon, authenticated;
revoke execute on function private.is_private_action(text) from public, anon;
grant execute on function private.is_private_action(text) to authenticated;
revoke execute on function public.set_payroll_details(uuid, uuid, uuid, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.set_payroll_details(uuid, uuid, uuid, jsonb, timestamptz)
  to service_role;
revoke execute on function private.purge_business_records(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.reset_demo_business(uuid)
  from public, anon, authenticated;
grant execute on function public.reset_demo_business(uuid) to service_role;
