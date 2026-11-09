-- Hours that stay (payroll P1; roadmap step 4א; issue #76): deleting a person,
-- their account or a business no longer deletes their hours, breaks or the
-- business's log. People leave by being made inactive. The demo reset deletes a
-- demo business's records itself (private.purge_business_records), and a
-- correction that cuts a break outside its entry logs what it cut. Corrections
-- and added shifts need a reason, which the log keeps.
--
--   keys        time_entries, time_breaks and audit_log refer to their business,
--               person and entry with `on delete restrict`: a delete that would
--               take them along fails with 23503.
--   no deletes  a trigger on each refuses every delete (42501) but two: a purge
--               that names the business (the demo reset, and test clean-ups run
--               as postgres), and the trim of breaks a correction leaves outside
--               its entry. Each is a setting of the transaction
--               (set_config(…, true)), which the Data API cannot set.
--   the log     never changes, but for its actor going to null when that
--               person's account goes (audit_log.actor_id is `on delete set
--               null`). Nobody but its owner updates, deletes or truncates it.
--   demo        the reset purges first and ends with private.seed_demo_pay, a
--               stub the next payroll parts replace, never the reset.
--   reasons     add_time_entry and correct_time_entry refuse a missing reason
--               (22023), and their log rows carry it as `note`.
--   breaks      a correction that cuts or removes breaks writes one
--               clock.break_fit row with each break before and after (null when
--               removed) and the shift's start. A clock-out that ends an open
--               break writes none.

------------------------------------------------------------------------------
-- 1. Keys: restrict, not cascade. The names are Postgres's own for the inline
--    references of 20261013000100_tenancy.sql, 20261107000100_time_clock.sql
--    and 20261107000300_time_breaks.sql.

alter table public.time_entries
  drop constraint time_entries_business_id_fkey,
  add constraint time_entries_business_id_fkey
    foreign key (business_id) references public.businesses (id) on delete restrict,
  drop constraint time_entries_user_id_fkey,
  add constraint time_entries_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete restrict;

alter table public.time_breaks
  drop constraint time_breaks_entry_id_fkey,
  add constraint time_breaks_entry_id_fkey
    foreign key (entry_id) references public.time_entries (id) on delete restrict,
  drop constraint time_breaks_business_id_fkey,
  add constraint time_breaks_business_id_fkey
    foreign key (business_id) references public.businesses (id) on delete restrict,
  drop constraint time_breaks_user_id_fkey,
  add constraint time_breaks_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete restrict;

alter table public.audit_log
  drop constraint audit_log_business_id_fkey,
  add constraint audit_log_business_id_fkey
    foreign key (business_id) references public.businesses (id) on delete restrict;

------------------------------------------------------------------------------
-- 2. Nothing deletes them

-- Whether this delete may go through: a purge that names the business, or, for
-- a break, the trim of its own entry. current_setting(…, true) is NULL in a
-- session that never set the name, so every comparison is wrapped: a NULL here
-- would let the delete through (an IF on NULL does not raise). A row without a
-- business (a template's log row) is never deleted.
create function private.deleting_allowed(business uuid, entry uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
      business is not null
        and coalesce(current_setting('ca.records_purge', true), '') = business::text,
      false)
    or coalesce(
      entry is not null
        and coalesce(current_setting('ca.fit_breaks', true), '') = entry::text,
      false)
$$;

create function private.refuse_entry_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.deleting_allowed(old.business_id, null::uuid) then
    raise exception 'Hours are kept: nothing deletes them' using errcode = '42501';
  end if;
  return old;
end;
$$;

create function private.refuse_break_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.deleting_allowed(old.business_id, old.entry_id) then
    raise exception 'Breaks are kept: nothing deletes them' using errcode = '42501';
  end if;
  return old;
end;
$$;

create function private.refuse_log_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.deleting_allowed(old.business_id, null::uuid) then
    raise exception 'The log is kept: nothing deletes it' using errcode = '42501';
  end if;
  return old;
end;
$$;

create trigger time_entries_kept before delete on public.time_entries
  for each row execute function private.refuse_entry_delete();
create trigger time_breaks_kept before delete on public.time_breaks
  for each row execute function private.refuse_break_delete();
create trigger audit_log_kept before delete on public.audit_log
  for each row execute function private.refuse_log_delete();

-- The log never changes either, but for one thing: audit_log.actor_id is
-- `on delete set null` (20261013000100_tenancy.sql), and that is an UPDATE this
-- trigger sees. Refusing it would make deleting any profile or account that
-- ever acted fail with 42501, hosted-demo.sql's stray-account delete included.
-- So the one change allowed is the actor going to null with nothing else.
create function private.refuse_log_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.actor_id is null and old.actor_id is not null
    and (new.id, new.business_id, new.action, new.details, new.created_at)
      is not distinct from (old.id, old.business_id, old.action, old.details, old.created_at)
  then
    return new;
  end if;
  raise exception 'The log is append-only' using errcode = '42501';
end;
$$;

create trigger audit_log_unchanged before update on public.audit_log
  for each row execute function private.refuse_log_update();

-- A truncate skips the triggers, so nobody but the owner may.
revoke update, delete, truncate on public.audit_log from service_role, authenticated, anon;
revoke truncate on public.time_entries, public.time_breaks
  from service_role, authenticated, anon;

revoke execute on function private.deleting_allowed(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.refuse_entry_delete()
  from public, anon, authenticated;
revoke execute on function private.refuse_break_delete()
  from public, anon, authenticated;
revoke execute on function private.refuse_log_delete()
  from public, anon, authenticated;
revoke execute on function private.refuse_log_update()
  from public, anon, authenticated;

------------------------------------------------------------------------------
-- 3. The demo reset's purge, and what a demo starts with on the pay side

-- Deletes, in order, every record of the business that blocks deleting it.
-- Private, executable by nobody but its owner: the reset calls it, and test
-- clean-ups run it as postgres. The setting goes back to what it was, so
-- nothing after the purge may delete the business's records.
create function private.purge_business_records(business uuid)
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
  -- P4 (member_wages), P5 (member_payroll_details, employment_periods) and P9
  -- (payroll_months) replace this function and delete theirs here.
  delete from public.audit_log a where a.business_id = business;
  perform set_config('ca.records_purge', coalesce(prior, ''), true);
end;
$$;

revoke execute on function private.purge_business_records(uuid)
  from public, anon, authenticated, service_role;

-- What a demo business starts with on the pay side. Nothing yet: P3, P4 and P5
-- replace this, never the reset.
create function private.seed_demo_pay(business uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select business where false
$$;

revoke execute on function private.seed_demo_pay(uuid)
  from public, anon, authenticated, service_role;

------------------------------------------------------------------------------
-- 4. The reset: 20261109000600_lists.sql's (20261109000700_lists_on.sql
--    replaces only seed_demo_lists), with the purge first and the pay seed last.

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
end;
$$;

revoke execute on function public.reset_demo_business(uuid)
  from public, anon, authenticated;
grant execute on function public.reset_demo_business(uuid) to service_role;

------------------------------------------------------------------------------
-- 5. Corrections need a reason, and the log keeps it

-- A manager adds an entry (20261108000300_sealed.sql), with why.
create or replace function public.add_time_entry(
  actor uuid,
  business uuid,
  person uuid,
  new_clock_in timestamptz,
  new_clock_out timestamptz,
  note text default null,
  at_time timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry_id uuid;
  proof text;
begin
  perform private.check_time_clock_on(business);

  if not private.can_edit_clock(business, actor) then
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.memberships m
    where m.business_id = business and m.user_id = person
  ) then
    raise exception 'Not a member of the business' using errcode = '42501';
  end if;

  if nullif(btrim(add_time_entry.note), '') is null then
    raise exception 'A correction needs its reason' using errcode = '22023';
  end if;

  perform private.check_entry_times(new_clock_in, new_clock_out, at_time);

  proof := case
    when person = actor and not private.is_active_owner(business, actor) then 'self'
    else 'manager'
  end;

  insert into public.time_entries (
    business_id, user_id, clock_in, clock_out, source, note, edited_by, edited_at,
    in_proof, out_proof
  )
  values (
    business, person, new_clock_in, new_clock_out, 'manager',
    btrim(add_time_entry.note), actor, at_time,
    proof, case when new_clock_out is null then null else proof end
  )
  returning id into entry_id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, actor, 'clock.add',
    jsonb_build_object('entry', entry_id, 'person', person,
      'clock_in', new_clock_in, 'clock_out', new_clock_out, 'proof', proof,
      'note', btrim(add_time_entry.note))
  );

  return entry_id;
end;
$$;

-- A manager changes an entry's times (20261108000300_sealed.sql), with why. The
-- entry keeps the newest reason; the log keeps each. While the entry's times
-- change, `ca.correcting` names the actor, so the breaks it trims are logged
-- as theirs (private.fit_breaks_to_entry).
create or replace function public.correct_time_entry(
  actor uuid,
  entry uuid,
  new_clock_in timestamptz,
  new_clock_out timestamptz default null,
  note text default null,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.time_entries%rowtype;
  by_owner boolean;
  in_moved boolean;
  out_moved boolean;
  new_in_proof text;
  new_out_proof text;
begin
  select * into e from public.time_entries where id = entry for update;
  if not found then
    raise exception 'Unknown entry' using errcode = 'P0002';
  end if;

  perform private.check_time_clock_on(e.business_id);

  if not private.can_edit_clock(e.business_id, actor) then
    raise exception 'Managers and owners only' using errcode = '42501';
  end if;

  if new_clock_out is null and e.clock_out is not null then
    raise exception 'An entry that ended needs an end' using errcode = '22023';
  end if;

  if nullif(btrim(correct_time_entry.note), '') is null then
    raise exception 'A correction needs its reason' using errcode = '22023';
  end if;

  perform private.check_entry_times(new_clock_in, new_clock_out, at_time);

  if new_clock_out is null and at_time - new_clock_in > interval '24 hours' then
    raise exception 'An entry is at most 24 hours' using errcode = '22023';
  end if;

  by_owner := private.is_active_owner(e.business_id, actor);
  in_moved := new_clock_in is distinct from e.clock_in;
  out_moved := new_clock_out is distinct from e.clock_out;

  new_in_proof := case
    when not in_moved then e.in_proof
    when by_owner then 'manager'
    when e.user_id = actor or e.in_proof = 'self' then 'self'
    else 'manager'
  end;
  new_out_proof := case
    when not out_moved then e.out_proof
    when by_owner then 'manager'
    when e.user_id = actor or e.out_proof = 'self' then 'self'
    else 'manager'
  end;

  perform set_config('ca.correcting', actor::text, true);
  update public.time_entries
  set clock_in = new_clock_in,
    clock_out = new_clock_out,
    note = btrim(correct_time_entry.note),
    edited_by = actor,
    edited_at = at_time,
    in_proof = new_in_proof,
    out_proof = new_out_proof,
    in_station = case when in_moved then null else time_entries.in_station end,
    out_station = case when out_moved then null else time_entries.out_station end,
    confirmed_by = case
      when (in_moved and new_in_proof = 'self') or (out_moved and new_out_proof = 'self')
        then null
      else time_entries.confirmed_by
    end,
    confirmed_at = case
      when (in_moved and new_in_proof = 'self') or (out_moved and new_out_proof = 'self')
        then null
      else time_entries.confirmed_at
    end
  where id = entry;
  perform set_config('ca.correcting', '', true);

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    e.business_id, actor, 'clock.correct',
    jsonb_build_object('entry', entry, 'person', e.user_id,
      'from', jsonb_build_object('clock_in', e.clock_in, 'clock_out', e.clock_out),
      'to', jsonb_build_object('clock_in', new_clock_in, 'clock_out', new_clock_out),
      'proof', jsonb_build_object('in', new_in_proof, 'out', new_out_proof),
      'note', btrim(correct_time_entry.note))
  );
end;
$$;

------------------------------------------------------------------------------
-- 6. Break trims are logged

-- An entry's breaks stay inside it (20261107000400_clock_corrections.sql): an
-- entry that moves whole takes them along; otherwise those wholly outside go
-- and the rest are cut to fit, which only this trigger may delete
-- (`ca.fit_breaks`). It runs on every change of clock_in or clock_out, and a
-- clock-out ends an open break, so only a correction (`ca.correcting`, set by
-- correct_time_entry) is logged: one clock.break_fit row, by the corrector,
-- with each break before and after, `to` null for one removed, and the
-- entry's corrected clock_in, which names the shift's day as clock.correct does.
create or replace function private.fit_breaks_to_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed jsonb;
  corrector uuid;
begin
  -- The whole entry moved by the same amount: its breaks go with it.
  if new.clock_in <> old.clock_in
    and new.clock_out is not null
    and old.clock_out is not null
    and new.clock_in - old.clock_in = new.clock_out - old.clock_out
  then
    set constraints public.time_breaks_no_overlap deferred;
    update public.time_breaks b
    set started_at = b.started_at + (new.clock_in - old.clock_in),
      ended_at = b.ended_at + (new.clock_in - old.clock_in)
    where b.entry_id = new.id;
    set constraints public.time_breaks_no_overlap immediate;
    return null;
  end if;

  -- What the delete and the update below are about to do, for the log.
  select jsonb_agg(
      jsonb_build_object(
        'break', b.id,
        'from', jsonb_build_object('start', b.started_at, 'end', b.ended_at),
        'to', case
          when b.started_at >= coalesce(new.clock_out, 'infinity'::timestamptz)
            or b.ended_at <= new.clock_in
            then null
          else jsonb_build_object(
            'start', greatest(b.started_at, new.clock_in),
            'end', case
              when new.clock_out is null then b.ended_at
              else least(coalesce(b.ended_at, new.clock_out), new.clock_out)
            end
          )
        end
      )
      order by b.started_at
    )
  into changed
  from public.time_breaks b
  where b.entry_id = new.id
    and (
      b.started_at >= coalesce(new.clock_out, 'infinity'::timestamptz)
      or b.ended_at <= new.clock_in
      or b.started_at < new.clock_in
      or (new.clock_out is not null and (b.ended_at is null or b.ended_at > new.clock_out))
    );

  perform set_config('ca.fit_breaks', new.id::text, true);

  delete from public.time_breaks b
  where b.entry_id = new.id
    and (
      b.started_at >= coalesce(new.clock_out, 'infinity'::timestamptz)
      or b.ended_at <= new.clock_in
    );

  update public.time_breaks b
  set started_at = greatest(b.started_at, new.clock_in),
    ended_at = case
      when new.clock_out is null then b.ended_at
      else least(coalesce(b.ended_at, new.clock_out), new.clock_out)
    end
  where b.entry_id = new.id
    and (
      b.started_at < new.clock_in
      or (new.clock_out is not null and (b.ended_at is null or b.ended_at > new.clock_out))
    );

  perform set_config('ca.fit_breaks', '', true);

  corrector := nullif(coalesce(current_setting('ca.correcting', true), ''), '')::uuid;
  if corrector is not null and jsonb_array_length(coalesce(changed, '[]'::jsonb)) > 0 then
    insert into public.audit_log (business_id, actor_id, action, details)
    values (
      new.business_id, corrector, 'clock.break_fit',
      jsonb_build_object('entry', new.id, 'person', new.user_id,
        'clock_in', new.clock_in, 'breaks', changed)
    );
  end if;

  return null;
end;
$$;

revoke execute on function private.fit_breaks_to_entry() from public;

comment on table public.audit_log is
  'Append-only record of what changed in a business: written only by server functions, never changed but for its actor going when their account does, deleted only by a demo reset (private.purge_business_records).';
