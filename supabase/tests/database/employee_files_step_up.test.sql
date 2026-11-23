-- A holder's step-up kept in the database, for one sign-in
-- (20261127000400_file_step_up.sql): nobody touches its table but its three
-- functions, the secret key's; a ready holder's read, reveal and export say
-- 'step_up' without one, whoever the person is, logged, and nothing of a
-- file comes back; one opened after a right code reads for that holder and
-- sign-in (the token's session_id) alone, another holder's token on the same
-- id riding nothing, in one business, for 15 minutes after the last
-- activity and not more than a minute ahead; opening logs nothing and clears
-- the holder's lapsed ones, never a live one on another sign-in; keeping
-- slides only a live one, never one ahead, and never opens one; closing
-- takes this sign-in's alone. Opening is refused with the module off,
-- before the duties, for anyone but an active holder, without a sign-in and
-- in the week after a phone change (its day in the business's zone). A
-- view, the person's own file and someone who left are as before. And a
-- sign-in number changes only as the team changes it: any other change of
-- auth.users.phone, or a new phone_change, is refused, the auth server's
-- with confirmations on and off and the admin API's; an update that leaves
-- both as they were goes on. Times are relative to the transaction's now(),
-- or fixed by hand. Fixed ids (f8…), numbers (050-089-xxxx) and slugs
-- (esu-…), so nothing here meets the seed or another test.
begin;
select plan(64);

-- A (the module on): 1 its owner, who confirmed the duties; 2 the
-- accountant, who hasn't; 3 Noa and 4 Yoav, workers with files; 5 a
-- manager; 6 a worker who left, with a file; 12 its other owner, who
-- confirmed the duties too and never opens one. B (on): 1 its owner too, 11 a
-- worker with a file. C (off): 8 its owner. 7 is on the ConceptApp team,
-- viewing A as an owner. 9 asked for a new number before this (a pending
-- phone_change), 10 is anyone.
insert into auth.users (id, aud, role, phone, phone_change)
select ('f8000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250089' || lpad(n::text, 4, '0'),
  case when n = 9 then '972500899997' else '' end
from generate_series(1, 12) as n;

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('f8000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.biz(n integer) returns uuid language sql as $$
  select ('f8000000-0000-4000-b000-' || lpad(n::text, 12, '0'))::uuid
$$;
-- A sign-in, as the auth server names one in its tokens.
create function pg_temp.s(n integer) returns uuid language sql as $$
  select ('f8000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;

insert into public.businesses (id, slug, name)
values
  (pg_temp.biz(1), 'esu-a', 'Step-up A'),
  (pg_temp.biz(2), 'esu-b', 'Step-up B'),
  (pg_temp.biz(3), 'esu-c', 'Step-up C');
insert into public.memberships (business_id, user_id, role, active)
values
  (pg_temp.biz(1), pg_temp.p(1), 'owner', true),
  (pg_temp.biz(1), pg_temp.p(2), 'accountant', true),
  (pg_temp.biz(1), pg_temp.p(3), 'worker', true),
  (pg_temp.biz(1), pg_temp.p(4), 'worker', true),
  (pg_temp.biz(1), pg_temp.p(5), 'manager', true),
  (pg_temp.biz(1), pg_temp.p(6), 'worker', false),
  (pg_temp.biz(1), pg_temp.p(12), 'owner', true),
  (pg_temp.biz(2), pg_temp.p(1), 'owner', true),
  (pg_temp.biz(2), pg_temp.p(11), 'worker', true),
  (pg_temp.biz(3), pg_temp.p(8), 'owner', true);
insert into public.business_modules (business_id, module_key, enabled, settings)
values
  (pg_temp.biz(1), 'employee_files', true, '{}'),
  (pg_temp.biz(2), 'employee_files', true, '{}'),
  (pg_temp.biz(3), 'employee_files', false, '{}');
insert into public.platform_staff (user_id, role) values (pg_temp.p(7), 'onboarder');
insert into public.view_sessions (staff_id, business_id, role)
values (pg_temp.p(7), pg_temp.biz(1), 'owner');
insert into public.employee_details (business_id, user_id, legal_first_name, legal_last_name)
values
  (pg_temp.biz(1), pg_temp.p(3), 'Noa', 'Cohen'),
  (pg_temp.biz(1), pg_temp.p(4), 'Yoav', 'Levi'),
  (pg_temp.biz(1), pg_temp.p(6), 'Dana', 'Mor'),
  (pg_temp.biz(2), pg_temp.p(11), 'Tal', 'Bar');
insert into private.file_acknowledgements (business_id, user_id, version)
values
  (pg_temp.biz(1), pg_temp.p(1), '2026-11-v1'),
  (pg_temp.biz(1), pg_temp.p(12), '2026-11-v1'),
  (pg_temp.biz(2), pg_temp.p(1), '2026-11-v1');

-- Signed in on the sign-in `session`, as PostgREST sets a token's claims.
create function pg_temp.sign_in(uid uuid, session text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'session_id', session)::text, true);
  select set_config('role', 'authenticated', true);
$$;
-- A token with no session_id at all.
create function pg_temp.sign_in_bare(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
-- What the signed-in person's read of a file answers: who they are to it, or why not.
create function pg_temp.read(business uuid, person uuid) returns text language sql as $$
  select coalesce(x.f ->> 'reason', x.f ->> 'access', 'nothing')
  from (select public.employee_file(business, person) as f) as x
$$;
-- The same of a reveal of the ID number.
create function pg_temp.reveal(business uuid, person uuid) returns text language sql as $$
  select coalesce(x.f ->> 'reason', x.f ->> 'access', 'nothing')
  from (select public.reveal_employee_fields(business, person, '{id}') as f) as x
$$;
-- What a call is refused with, `sqlstate:hint`, or 'ok'.
create function pg_temp.refusal(call text) returns text language plpgsql as $$
declare
  got_code text;
  got_hint text;
begin
  execute call;
  return 'ok';
exception when others then
  get stacked diagnostics got_code = returned_sqlstate, got_hint = pg_exception_hint;
  return got_code || ':' || coalesce(got_hint, '');
end;
$$;
-- A refusal's DETAIL, or null when nothing refused.
create function pg_temp.refused_on(call text) returns text language plpgsql as $$
declare
  said text;
begin
  execute call;
  return null;
exception when others then
  get stacked diagnostics said = pg_exception_detail;
  return said;
end;
$$;
-- The rows of `what` in A's log by the owner.
create function pg_temp.logged(what text) returns integer language sql as $$
  select count(*)::integer from public.audit_log a
  where a.business_id = pg_temp.biz(1) and a.action = what and a.actor_id = pg_temp.p(1)
$$;
-- How many rows of any action a call adds to A's log by the owner.
create function pg_temp.logs_added(call text) returns integer language plpgsql as $$
declare
  rows_before integer;
  rows_after integer;
begin
  select count(*)::integer into rows_before from public.audit_log a
  where a.business_id = pg_temp.biz(1) and a.actor_id = pg_temp.p(1);
  execute call;
  select count(*)::integer into rows_after from public.audit_log a
  where a.business_id = pg_temp.biz(1) and a.actor_id = pg_temp.p(1);
  return rows_after - rows_before;
end;
$$;

------------------------------------------------------------------------------
-- Nobody touches the step-ups but their functions

select ok(
  (select c.relrowsecurity from pg_class c where c.oid = 'private.file_step_ups'::regclass),
  'the step-ups have row-level security'
);
select ok(
  not (select bool_or(has_table_privilege(r.role, 'private.file_step_ups',
      'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'))
   from (values ('anon'), ('authenticated'), ('service_role')) as r (role)),
  'and no privilege on them for anyone, the secret key''s included'
);
select is(
  (select count(*)::integer
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.prosecdef
     and exists (
       select 1 from unnest(p.proconfig) as c (setting)
       where c.setting in ('search_path=""', 'search_path=')
     )
     and (n.nspname::text, p.proname::text) in (
       ('private', 'file_step_up_live'), ('public', 'open_file_step_up'),
       ('public', 'keep_file_step_up'), ('public', 'close_file_step_up'),
       ('public', 'refuse_own_phone_change'), ('private', 'file_reader'),
       ('public', 'export_employee_files')
     )),
  7,
  'every function of the step-up runs as its owner, with an empty search_path'
);
select ok(
  (select bool_and(has_function_privilege('service_role', f, 'execute')
      and not has_function_privilege('authenticated', f, 'execute')
      and not has_function_privilege('anon', f, 'execute'))
   from unnest(array[
     'public.open_file_step_up(uuid, uuid, uuid, timestamptz)',
     'public.keep_file_step_up(uuid, uuid, uuid, timestamptz)',
     'public.close_file_step_up(uuid, uuid)'
   ]) as f)
  and (select bool_and(not has_function_privilege('authenticated', f, 'execute')
      and not has_function_privilege('anon', f, 'execute'))
   from unnest(array[
     'private.file_step_up_live(uuid)',
     'public.refuse_own_phone_change()'
   ]) as f)
  and has_function_privilege('authenticated', 'public.export_employee_files(uuid, text)', 'execute'),
  'the step-up''s writes are the secret key''s, its check and the trigger nobody''s, the export still a session''s'
);
select ok(
  exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'auth.users'::regclass
      and t.tgname = 'on_auth_user_phone_change_asked'
      and t.tgfoid = 'public.refuse_own_phone_change()'::regprocedure
      and t.tgtype & 1 = 1    -- for each row
      and t.tgtype & 2 = 2    -- before
      and t.tgtype & 16 = 16  -- update
      and t.tgenabled = 'O'
  ),
  'a number''s change is asked before each row of auth.users is updated'
);

------------------------------------------------------------------------------
-- A ready holder without a step-up reads nothing

select pg_temp.sign_in(pg_temp.p(1), pg_temp.s(1)::text);
select is(public.employee_file(pg_temp.biz(1), pg_temp.p(3)),
  jsonb_build_object('access', 'denied', 'reason', 'step_up'),
  'the owner, duties confirmed, reads no file without a step-up: the refusal alone, nothing of it');
select is(pg_temp.reveal(pg_temp.biz(1), pg_temp.p(3)), 'step_up', 'and reveals no number');
select is(public.export_employee_files(pg_temp.biz(1), 'provider'),
  jsonb_build_object('access', 'denied', 'reason', 'step_up'),
  'and exports nothing');
select is(pg_temp.read(pg_temp.biz(1), gen_random_uuid()), 'step_up',
  'and is told the same of an id that isn''t on the staff, so nothing says who is');
reset role;
select is(
  (select count(*)::integer from public.audit_log a
   where a.business_id = pg_temp.biz(1) and a.actor_id = pg_temp.p(1)
     and a.action = 'employee.view_denied' and a.details ->> 'reason' = 'step_up'),
  3,
  'the read, the reveal and the export are each logged as refused for no step-up'
);
select is(pg_temp.logged('employee.view') + pg_temp.logged('employee.export'), 0,
  'and nothing was logged as seen');

------------------------------------------------------------------------------
-- Opened after a right code, for this sign-in

select is(
  pg_temp.logs_added($$select public.open_file_step_up(pg_temp.p(1), pg_temp.biz(1), pg_temp.s(1))$$),
  0, 'opened after a right code, with nothing written to the log');
select pg_temp.sign_in(pg_temp.p(1), pg_temp.s(1)::text);
select is(pg_temp.read(pg_temp.biz(1), pg_temp.p(3)), 'holder', 'opened, the owner reads Noa''s file');
select is(public.employee_file(pg_temp.biz(1), pg_temp.p(3)) -> 'file' ->> 'legal_first_name', 'Noa',
  'with its plain part');
select is(pg_temp.reveal(pg_temp.biz(1), pg_temp.p(3)), 'holder', 'reveals her number');
select ok(
  (select f ->> 'access' = 'holder' and jsonb_array_length(f -> 'entries') = 2
   from (select public.export_employee_files(pg_temp.biz(1), 'provider') as f) as x),
  'and exports the staff''s files'
);
reset role;
select is(
  (select count(*)::integer from public.audit_log a
   where a.business_id = pg_temp.biz(1) and a.actor_id = pg_temp.p(1)
     and a.action = 'employee.view' and a.details ->> 'person' = pg_temp.p(3)::text
     and a.details -> 'fields' = '["file"]'::jsonb),
  1,
  'the file''s read is logged once, as before'
);
select pg_temp.sign_in(pg_temp.p(1), pg_temp.s(2)::text);
select is(pg_temp.read(pg_temp.biz(1), pg_temp.p(3)), 'step_up', 'another sign-in of the same owner reads nothing');
select pg_temp.sign_in_bare(pg_temp.p(1));
select is(pg_temp.read(pg_temp.biz(1), pg_temp.p(3)), 'step_up', 'nor a token without a session_id');
select pg_temp.sign_in(pg_temp.p(1), 'not-a-uuid');
select is(pg_temp.read(pg_temp.biz(1), pg_temp.p(3)), 'step_up',
  'nor one whose session_id isn''t a uuid, and nothing raises');
select pg_temp.sign_in(pg_temp.p(4), pg_temp.s(1)::text);
select is(pg_temp.read(pg_temp.biz(1), pg_temp.p(3)), 'not_holder',
  'and a worker''s token on the same sign-in id is still no holder');
select pg_temp.sign_in(pg_temp.p(12), pg_temp.s(1)::text);
select is(pg_temp.read(pg_temp.biz(1), pg_temp.p(3)), 'step_up',
  'nor A''s other owner, a ready holder too, on the owner''s sign-in id');
reset role;

------------------------------------------------------------------------------
-- 15 minutes after the last activity, a minute ahead at most

select public.open_file_step_up(pg_temp.p(1), pg_temp.biz(1), pg_temp.s(1), now() - interval '16 minutes');
select pg_temp.sign_in(pg_temp.p(1), pg_temp.s(1)::text);
select is(pg_temp.read(pg_temp.biz(1), pg_temp.p(3)), 'step_up', 'one opened 16 minutes ago has closed');
reset role;
select public.open_file_step_up(pg_temp.p(1), pg_temp.biz(1), pg_temp.s(1), now() - interval '14 minutes');
select pg_temp.sign_in(pg_temp.p(1), pg_temp.s(1)::text);
select is(pg_temp.read(pg_temp.biz(1), pg_temp.p(3)), 'holder', 'one opened 14 minutes ago still reads');
reset role;
select public.open_file_step_up(pg_temp.p(1), pg_temp.biz(1), pg_temp.s(1), now() + interval '2 minutes');
select pg_temp.sign_in(pg_temp.p(1), pg_temp.s(1)::text);
select is(pg_temp.read(pg_temp.biz(1), pg_temp.p(3)), 'step_up', 'one two minutes ahead reads nothing');
reset role;
select public.open_file_step_up(pg_temp.p(1), pg_temp.biz(1), pg_temp.s(1), now() - interval '16 minutes');
select is(public.keep_file_step_up(pg_temp.p(1), pg_temp.biz(1), pg_temp.s(1)), false,
  'keeping one that closed slides nothing');
select pg_temp.sign_in(pg_temp.p(1), pg_temp.s(1)::text);
select is(pg_temp.read(pg_temp.biz(1), pg_temp.p(3)), 'step_up', 'and opens nothing');
reset role;
select public.open_file_step_up(pg_temp.p(1), pg_temp.biz(1), pg_temp.s(1), now() - interval '10 minutes');
select is(public.keep_file_step_up(pg_temp.p(1), pg_temp.biz(1), pg_temp.s(1)), true,
  'keeping a live one slides it');
select is(
  (select s.active_at from private.file_step_ups s
   where s.user_id = pg_temp.p(1) and s.session_id = pg_temp.s(1)),
  now(),
  'to the moment kept');
select is(public.keep_file_step_up(pg_temp.p(1), pg_temp.biz(2), pg_temp.s(1)), false,
  'and keeping it for another business slides nothing');
select public.open_file_step_up(pg_temp.p(1), pg_temp.biz(1), pg_temp.s(6), now() + interval '2 minutes');
select is(public.keep_file_step_up(pg_temp.p(1), pg_temp.biz(1), pg_temp.s(6)), false,
  'keeping one two minutes ahead slides nothing');
select is(
  (select s.active_at from private.file_step_ups s
   where s.user_id = pg_temp.p(1) and s.session_id = pg_temp.s(6)),
  now() + interval '2 minutes',
  'and leaves it where it was');

------------------------------------------------------------------------------
-- One business per sign-in

select public.open_file_step_up(pg_temp.p(1), pg_temp.biz(2), pg_temp.s(1));
select pg_temp.sign_in(pg_temp.p(1), pg_temp.s(1)::text);
select is(pg_temp.read(pg_temp.biz(1), pg_temp.p(3)), 'step_up', 'opening B on a sign-in closes A there');
select is(pg_temp.read(pg_temp.biz(2), pg_temp.p(11)), 'holder', 'and B reads');
reset role;

------------------------------------------------------------------------------
-- Opening clears the holder's lapsed step-ups, never a live one

-- A sign-in left 20 minutes ago, its step-up still there.
insert into private.file_step_ups (user_id, session_id, business_id, active_at)
values (pg_temp.p(1), pg_temp.s(5), pg_temp.biz(1), now() - interval '20 minutes');
select public.open_file_step_up(pg_temp.p(1), pg_temp.biz(1), pg_temp.s(1));
select public.open_file_step_up(pg_temp.p(1), pg_temp.biz(1), pg_temp.s(2));
select is(
  (select count(*)::integer from private.file_step_ups s
   where s.user_id = pg_temp.p(1) and s.session_id = pg_temp.s(5)),
  0, 'opening one clears the holder''s lapsed step-up on another sign-in');
select pg_temp.sign_in(pg_temp.p(1), pg_temp.s(1)::text);
select is(pg_temp.read(pg_temp.biz(1), pg_temp.p(3)), 'holder',
  'while one opened before on another sign-in stays open');
select pg_temp.sign_in(pg_temp.p(1), pg_temp.s(2)::text);
select is(pg_temp.read(pg_temp.biz(1), pg_temp.p(3)), 'holder', 'beside the one just opened');
reset role;

------------------------------------------------------------------------------
-- Closing

select public.open_file_step_up(pg_temp.p(1), pg_temp.biz(1), pg_temp.s(1));
select public.open_file_step_up(pg_temp.p(1), pg_temp.biz(1), pg_temp.s(2));
select public.close_file_step_up(pg_temp.p(1), pg_temp.s(1));
select pg_temp.sign_in(pg_temp.p(1), pg_temp.s(1)::text);
select is(pg_temp.read(pg_temp.biz(1), pg_temp.p(3)), 'step_up', 'closed on this sign-in, it reads nothing');
select pg_temp.sign_in(pg_temp.p(1), pg_temp.s(2)::text);
select is(pg_temp.read(pg_temp.biz(1), pg_temp.p(3)), 'holder', 'while another sign-in''s stays open');
reset role;
select is(pg_temp.refusal($$select public.close_file_step_up(pg_temp.p(1), pg_temp.s(3))$$), 'ok',
  'closing what isn''t there is fine');

------------------------------------------------------------------------------
-- Who may open one

select is(pg_temp.refusal($$select public.open_file_step_up(pg_temp.p(8), pg_temp.biz(3), pg_temp.s(1))$$),
  '42501:off', 'not with the module off');
select is(pg_temp.refusal($$select public.open_file_step_up(pg_temp.p(2), pg_temp.biz(1), pg_temp.s(1))$$),
  '42501:ack', 'not for the accountant before the duties');
select is(pg_temp.refusal($$select public.open_file_step_up(pg_temp.p(5), pg_temp.biz(1), pg_temp.s(1))$$),
  '42501:', 'not for a manager without the files');
select is(pg_temp.refusal($$select public.open_file_step_up(pg_temp.p(7), pg_temp.biz(1), pg_temp.s(1))$$),
  '42501:', 'not for the ConceptApp team viewing as an owner');
select is(pg_temp.refusal($$select public.open_file_step_up(pg_temp.p(1), pg_temp.biz(1), null)$$),
  '22023:', 'not without a sign-in');
-- The week after a phone change, at 10:00 on 26 November 2026 in Israel:
-- the number changed at 00:30 on the 24th, so it ends at 00:30 on 1
-- December there (22:30 on 30 November in UTC, the session's zone here, so
-- a day read without the business's zone would differ).
insert into private.phone_changes (user_id, changed_at)
values (pg_temp.p(1), '2026-11-24 00:30+02');
set local timezone = 'UTC';
select is(
  pg_temp.refusal($$select public.open_file_step_up(pg_temp.p(1), pg_temp.biz(1), pg_temp.s(4), '2026-11-26 10:00+02')$$),
  '55000:phone_hold', 'not in the week after a phone change');
select is(
  pg_temp.refused_on($$select public.open_file_step_up(pg_temp.p(1), pg_temp.biz(1), pg_temp.s(4), '2026-11-26 10:00+02')$$),
  '2026-12-01', 'which says the day it ends in the business''s zone');
reset timezone;
select is(
  (select count(*)::integer from private.file_step_ups s
   where s.user_id = pg_temp.p(1) and s.session_id = pg_temp.s(4)),
  0, 'and opens nothing');
update private.phone_changes set changed_at = '2026-11-18 10:00+02' where user_id = pg_temp.p(1);
select is(
  pg_temp.refusal($$select public.open_file_step_up(pg_temp.p(1), pg_temp.biz(1), pg_temp.s(4), '2026-11-26 10:00+02')$$),
  'ok', 'and opens again 8 days on');

------------------------------------------------------------------------------
-- As before

select pg_temp.sign_in(pg_temp.p(3), pg_temp.s(1)::text);
select is(pg_temp.read(pg_temp.biz(1), pg_temp.p(3)), 'self', 'Noa reads her own file with no step-up');
select pg_temp.sign_in(pg_temp.p(6), pg_temp.s(1)::text);
select is(pg_temp.read(pg_temp.biz(1), pg_temp.p(6)), 'self', 'someone who left reads their own');
select is(pg_temp.reveal(pg_temp.biz(1), pg_temp.p(6)), 'self', 'and reveals their own number');
reset role;
-- A step-up written for the team member's sign-in by hand: a view still reads nothing.
insert into private.file_step_ups (user_id, session_id, business_id, active_at)
values (pg_temp.p(7), pg_temp.s(1), pg_temp.biz(1), now());
select pg_temp.sign_in(pg_temp.p(7), pg_temp.s(1)::text);
select is(pg_temp.read(pg_temp.biz(1), pg_temp.p(3)), 'viewing', 'a view reads no file, a step-up or not');
select pg_temp.sign_in(pg_temp.p(1), pg_temp.s(9)::text);
select is(public.file_holder_state(pg_temp.biz(1)), 'ready',
  'and the holder''s gate, before a code, still says ready');
reset role;

------------------------------------------------------------------------------
-- A sign-in number, changed by the team alone

select is(pg_temp.refusal($$update auth.users set phone_change = '972500899999' where id = pg_temp.p(10)$$),
  '42501:', 'asking for a new number is refused (the auth server, confirmations on)');
select is(
  pg_temp.refusal($$update auth.users set phone = '972500899998', phone_change = '',
      phone_change_token = '', phone_confirmed_at = now() where id = pg_temp.p(10)$$),
  '42501:', 'and so is the number written at once (confirmations off)');
select is(pg_temp.refusal($$update auth.users set phone = '972500899998' where id = pg_temp.p(10)$$),
  '42501:', 'and the admin API''s, the dashboard''s');
select is(
  pg_temp.refusal($$update auth.users set phone_change = '', phone_change_token = '' where id = pg_temp.p(10)$$),
  'ok', 'while the seed''s empty tokens go on');
select set_config('ca.phone_change', pg_temp.p(10)::text, true);
select is(pg_temp.refusal($$update auth.users set phone = '972500899998' where id = pg_temp.p(10)$$),
  'ok', 'the team changes a number in a transaction that names the person');
select is((select count(*)::integer from private.phone_changes c where c.user_id = pg_temp.p(10)), 1,
  'and the change is noted, so the bank and the files wait a week');
select is(pg_temp.refusal($$update auth.users set phone = '972500899996' where id = pg_temp.p(9)$$),
  '42501:', 'but naming one person changes no one else''s');
select set_config('ca.phone_change', '', true);
select is(
  pg_temp.refusal($$update auth.users set last_sign_in_at = now(), confirmation_token = '' where id = pg_temp.p(9)$$),
  'ok', 'a sign-in of someone with an old ask goes on');
select is(
  pg_temp.refusal($$update auth.users set phone_change = phone_change, phone_change_token = '' where id = pg_temp.p(9)$$),
  'ok', 'and so does an update that names the ask and leaves it');
select is(
  pg_temp.refusal($$update auth.users set phone = phone_change, phone_change = '' where id = pg_temp.p(9)$$),
  '42501:', 'but the old ask is never confirmed');

select * from finish();
rollback;
