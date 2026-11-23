-- The hiring file (profile H6a's step-up, security sweep before a real
-- business): a holder's SMS code is now kept in the database too, for the
-- sign-in it was taken on, and a holder's read asks for it there; and a
-- sign-in number changes only as the ConceptApp team changes it.
--
--   the step-up  private.file_step_ups: one row per holder and sign-in (the
--                auth server's session_id, in every access token), for one
--                business, as the screens' cookie holds one. Written by the
--                server with the secret key after a right code
--                (public.open_file_step_up), slid by the same activity that
--                slides the cookie (keep_file_step_up, which never opens
--                one), and deleted by "נעילת התיק" and by signing out
--                (close_file_step_up). It counts 15 minutes after the last
--                activity, and not more than a minute ahead
--                (private.file_step_up_live). Until now only the cookie
--                held it, so a holder's session asking the database
--                itself (/rest/v1/rpc/employee_file, export_employee_files),
--                say one copied from a computer left open, got every
--                file's plain part with no code: the legal names, the birth
--                date, the bank's code and branch, the pension. Only the
--                sealed values needed the server. Now private.file_reader's
--                holder arm and public.export_employee_files answer
--                'step_up' without one, logged as every refusal is. Keyed
--                by the sign-in, so the lock still closes this device
--                alone, and a token of another sign-in rides no step-up.
--   the hold     no step-up opens in the week after a phone change (55000,
--                hint 'phone_hold', the day it opens as DETAIL), as a bank
--                change waits (set_employee_details): the code would have
--                gone to the new number. The server reads
--                public.bank_change_hold before a code goes, so none is
--                spent.
--   the number   a BEFORE UPDATE trigger on auth.users refuses any change of
--                `phone`, and any new `phone_change`, unless the
--                transaction names that person in `ca.phone_change`, as the
--                team's step in supabase/README.md does. With SMS
--                confirmations off, the auth server's "change my number"
--                (PUT /auth/v1/user) writes the new phone in one statement
--                and never sets phone_change, so refusing phone_change alone
--                would let a copied session move the number, and with it
--                every code, to the one who copied it. The dashboard's own
--                edit is refused too.
--
-- It replaces private.file_reader and public.export_employee_files
-- (20261126000200_employee_files.sql's, unchanged since:
-- 20261126000600_file_started_and_changed.sql replaced neither), each its
-- newest body with only the step-up added, the same signatures; revoked and
-- granted again all the same. public.employee_file and
-- public.reveal_employee_fields log and answer whatever file_reader says,
-- so they don't change. Nothing else changes.

------------------------------------------------------------------------------
-- 1. The step-up, per sign-in

-- A holder's files open on one sign-in (the auth server's session_id) in
-- one business: written by the server after a right SMS code, slid by
-- activity on the file, gone 15 minutes after the last, or at "נעילת התיק"
-- and signing out. One business per sign-in, as the screens' cookie. No key
-- to auth.sessions, so nothing here leans on the auth server's tables but
-- auth.users; a holder's lapsed rows go each time they open again.
create table private.file_step_ups (
  user_id uuid not null references public.profiles (id) on delete cascade,
  session_id uuid not null,
  business_id uuid not null references public.businesses (id) on delete cascade,
  active_at timestamptz not null,
  primary key (user_id, session_id)
);

create index file_step_ups_business_idx on private.file_step_ups (business_id);

alter table private.file_step_ups enable row level security;
revoke all on private.file_step_ups from public, anon, authenticated, service_role;

comment on table private.file_step_ups is
  'A holder''s hiring files open on one sign-in (the access token''s session_id) in one business, after a right SMS code: written, slid and deleted only by public.open_file_step_up, keep_file_step_up and close_file_step_up (the secret key''s), read by private.file_step_up_live. Live 15 minutes after active_at.';

-- The signed-in holder's files are open on this sign-in in the business:
-- a step-up the server wrote for the token's session_id, active within the
-- last 15 minutes and not more than a minute ahead (two clocks), as
-- FILE_IDLE_MS and FILE_CLOCK_SKEW_MS in @domain/file-holders say
-- (tooling/employee-files-guard.test.ts keeps them the same). A token
-- without a session_id, or with one that isn't a uuid, opens nothing and
-- raises nothing: the id is compared as text.
create function private.file_step_up_live(business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.file_step_ups s
    where s.user_id = (select auth.uid())
      and s.session_id::text = ((select auth.jwt()) ->> 'session_id')
      and s.business_id = file_step_up_live.business
      and s.active_at > now() - interval '15 minutes'
      and s.active_at <= now() + interval '1 minute'
  )
$$;

-- After the server checked a right SMS code for `actor`'s own number: the
-- files open on the sign-in `auth_session` in the business, for 15 minutes
-- from `at_time`, in place of any other business that sign-in had open.
-- Refused: no sign-in (22023); the module off (42501, hint 'off'); a holder
-- before the duties (42501, hint 'ack'); anyone else, an active holder
-- alone opening (42501); and the week after a phone change (55000, hint
-- 'phone_hold', DETAIL the day it opens in the business's zone, as
-- set_employee_details says it for the bank). No log row, as note_step_up.
create function public.open_file_step_up(
  actor uuid,
  business uuid,
  auth_session uuid,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  set_on timestamptz := coalesce(at_time, now());
  tz text;
  phone_changed timestamptz;
begin
  if auth_session is null then
    raise exception 'A step-up is for one sign-in' using errcode = '22023';
  end if;
  if not private.module_enabled(business, 'employee_files'::public.module_key) then
    raise exception 'The employee file is off here' using errcode = '42501', hint = 'off';
  end if;
  if actor is null or not private.file_ready_holder(business, actor) then
    if actor is not null and private.holds_files(business, actor) then
      raise exception 'Confirm the duties first' using errcode = '42501', hint = 'ack';
    end if;
    raise exception 'A holder of the files' using errcode = '42501';
  end if;

  -- The week after a phone change: the code may have gone to a number
  -- that isn't the holder's.
  select b.timezone into tz from public.businesses b where b.id = business;
  select max(pc.changed_at) into phone_changed
  from private.phone_changes pc
  where pc.user_id = actor;
  if phone_changed is not null and phone_changed > set_on - interval '7 days' then
    raise exception 'Files open a week after a phone change'
      using errcode = '55000', hint = 'phone_hold',
        detail = to_char(((phone_changed + interval '7 days') at time zone tz)::date, 'YYYY-MM-DD');
  end if;

  delete from private.file_step_ups s
  where s.user_id = actor and s.active_at <= set_on - interval '15 minutes';
  insert into private.file_step_ups (user_id, session_id, business_id, active_at)
  values (actor, auth_session, business, set_on)
  on conflict (user_id, session_id) do update set
    business_id = excluded.business_id,
    active_at = excluded.active_at;
end;
$$;

-- The holder's activity on an open file: the step-up of the sign-in
-- `auth_session` in the business slides to `at_time`, only while it is
-- live, so this never opens one. Whether one was slid.
create function public.keep_file_step_up(
  actor uuid,
  business uuid,
  auth_session uuid,
  at_time timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  set_on timestamptz := coalesce(at_time, now());
  kept integer;
begin
  update private.file_step_ups s
  set active_at = greatest(s.active_at, set_on)
  where s.user_id = actor
    and s.session_id = auth_session
    and s.business_id = business
    and s.active_at > set_on - interval '15 minutes'
    and s.active_at <= set_on + interval '1 minute';
  get diagnostics kept = row_count;
  return kept > 0;
end;
$$;

-- "נעילת התיק", or signing out: the step-up of the sign-in `auth_session`
-- goes, whichever business it was for. Nothing there is fine.
create function public.close_file_step_up(actor uuid, auth_session uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.file_step_ups s
  where s.user_id = close_file_step_up.actor
    and s.session_id = close_file_step_up.auth_session
$$;

------------------------------------------------------------------------------
-- 2. The reads ask for it

-- 20261126000200_employee_files.sql's, with one arm before the person's
-- staff check: a ready holder without a live step-up on this sign-in is
-- told 'step_up' whoever the person is, so a lapsed or copied session can't
-- ask who is on the staff.
--
-- Who the signed-in person is to `person`'s file: 'self' (a membership of
-- any state: their access right after leaving too), 'holder' with a live
-- step-up on this sign-in (private.file_step_up_live), else 'step_up', or
-- why not. A view comes first, and someone not on the staff is no more
-- than not a member, so a refusal never says whether they are there.
create or replace function private.file_reader(business uuid, person uuid)
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
    when not private.file_step_up_live(file_reader.business) then 'step_up'::text
    when exists (
      select 1 from public.memberships m
      where m.business_id = file_reader.business
        and m.user_id = file_reader.person
        and private.is_staff_role(m.role)
    ) then 'holder'::text
    else 'not_member'::text
  end
$$;

-- 20261126000200_employee_files.sql's, with the step-up after the gate: a
-- ready holder without a live one on this sign-in is refused 'step_up',
-- logged, before anything is read.
--
-- The one bulk path, for the details for payroll (H6's sheet): ready
-- holders only, with a live step-up on this sign-in, never in a view. Every
-- active manager and worker with a file, every sealed value with the key;
-- an account a holder hasn't confirmed stays out, its plain parts too
-- ("bank_held"). One employee.export {people, recipient, held} is written
-- before anything returns. `recipient`: 'provider' (whoever does payroll)
-- or 'own'.
create or replace function public.export_employee_files(business uuid, recipient text)
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
  if gate is null and not private.file_step_up_live(business) then
    gate := 'step_up'::text;
  end if;
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

------------------------------------------------------------------------------
-- 3. A sign-in number, changed by the team alone

-- A sign-in number changes only as the ConceptApp team changes it: in a
-- transaction that names the person first, as supabase/README.md says
--   select set_config('ca.phone_change', '<user id>', true);
-- Anything else that would change auth.users.phone, or ask for a new one
-- (phone_change), is refused: the auth server's own "change my number"
-- (PUT /auth/v1/user {phone}), with phone confirmations on (it writes
-- phone_change first) or off (it writes phone at once, with no code), and
-- the admin API's, the dashboard's included. A first number comes with the
-- account (an insert), and an update that leaves both as they were passes,
-- so a sign-in, its code and the seed's empty tokens go on as before.
create function public.refuse_own_phone_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    new.phone is distinct from old.phone
    or (
      coalesce(new.phone_change, ''::text) <> ''::text
      and new.phone_change is distinct from old.phone_change
    )
  ) and current_setting('ca.phone_change', true) is distinct from new.id::text then
    raise exception 'A sign-in number changes only through the ConceptApp team'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger on_auth_user_phone_change_asked
  before update of phone, phone_change on auth.users
  for each row
  execute function public.refuse_own_phone_change();

------------------------------------------------------------------------------
-- 4. Who may call them

-- The step-up's writes: the secret key's alone, after the server's own
-- checks. Its check runs inside the reads, as their owner.
revoke execute on function public.open_file_step_up(uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.open_file_step_up(uuid, uuid, uuid, timestamptz)
  to service_role;
revoke execute on function public.keep_file_step_up(uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.keep_file_step_up(uuid, uuid, uuid, timestamptz)
  to service_role;
revoke execute on function public.close_file_step_up(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.close_file_step_up(uuid, uuid)
  to service_role;
revoke execute on function private.file_step_up_live(uuid) from public, anon, authenticated;

-- The trigger's, as note_phone_change's: run by the trigger alone.
revoke execute on function public.refuse_own_phone_change() from public, anon, authenticated;

-- Replaced in place, the same signatures, so their grants stay; revoked and
-- granted again all the same.
revoke execute on function private.file_reader(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.export_employee_files(uuid, text) from public, anon;
grant execute on function public.export_employee_files(uuid, text) to authenticated;
