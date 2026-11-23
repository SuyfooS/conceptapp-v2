-- The hiring file (profile H6b, issue #82 §2.5, §2.7, §3.3): what a
-- holder's screens need that the reads didn't give, and one mark at a time.
--
--   started_on  private.file_answer gives the current employment period's
--               first day (null with none), so a minor's file says when
--               the notice of the terms of work is due, a week on. The
--               periods themselves are read under the session only with
--               clock.payroll and the clock on, which a holder may lack.
--               Current: the newest that hasn't ended by the business's
--               today, so a fixed-term job whose end a pay holder entered
--               ahead (a summer job, up to a year ahead) still counts.
--   the pension private.pension_due_on reads the same current period, for
--               the same fixed-term job: before, its due day was null.
--   changed_at  public.employee_file_status gives a holder, in `detail`,
--               when the file or its 101 was last written, by anyone: the
--               newer of the file's updated_at and its years' newest.
--               Never a read, and never the emergency contact (its own
--               table), so the team's desktop says "שינוי אחרון" without
--               reading every log row of the business.
--   the marks   public.set_direct_groups adds or takes off one part
--               ("נמסר ישירות לשכר") under the file's lock, reading the
--               stored set there, and says whether anything changed. It
--               took the whole set a screen read before, so two holders'
--               presses at once could lose one mark, and a press that
--               changed nothing was offered an undo that took back another
--               holder's mark.
--
-- It replaces private.file_answer, private.pension_due_on and
-- public.employee_file_status (20261126000200_employee_files.sql's), each
-- its newest body with only these changes, the same signatures; and
-- public.set_direct_groups (20261126000200's, its body unchanged since),
-- dropped and made again with the new arguments and answer. Revoked and
-- granted again all the same. Nothing else changes.

------------------------------------------------------------------------------
-- 1. The file, with the current period's start

-- The file as `reader` reads it ('self' or 'holder'): its plain part, the
-- sealed values the screens open (never the ID number or the account), the
-- wrapped key, what is missing, the 18th birthday, the pension's due date,
-- the current employment period's first day (the newest not ended by the
-- business's today: open, or ending ahead) and the 101 years.
create or replace function private.file_answer(business uuid, person uuid, reader text)
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
    'started_on', (
      select p.started_on from public.employment_periods p
      where p.business_id = file_answer.business
        and p.user_id = file_answer.person
        and (
          p.ended_on is null
          or p.ended_on >= private.file_today(file_answer.business, now())
        )
      order by p.started_on desc
      limit 1
    ),
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
-- 2. The pension's due day, from the same current period

-- When the pension answer is due: 60 days after the current period began
-- (the newest not ended by the business's today: open, or ending ahead),
-- while there is none (or 'later') and it wasn't handed directly.
create or replace function private.pension_due_on(business uuid, person uuid)
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
    and (
      p.ended_on is null
      or p.ended_on >= private.file_today(pension_due_on.business, now())
    )
    and (e.pension_answer is null or e.pension_answer = 'later')
    and not ('pension' = any (coalesce(e.direct_groups, '{}'::text[])))
  order by p.started_on desc
  limit 1
$$;

------------------------------------------------------------------------------
-- 3. The status, with when each file last changed

-- How complete each active manager's and worker's file is (owners are left
-- out, as for a payroll number), while the module is on. A holder (not in a
-- view) reads every column with `detail`: which groups are missing, this
-- year's 101, the pension's due date, the bank's review, the 18th birthday,
-- when it was sent, and when the file or any of its 101s was last written
-- (by anyone; never a read, never the emergency contact; null for neither).
-- Whoever sees the team (team.view, and a view as such a role, as
-- public.team_phones) reads whether it is complete, how many are missing
-- and whether this year's 101 is in, a returned one as not in and one due
-- again as in, so nothing hints at a change in someone's life. Anyone else,
-- nothing. Never a value, a hint or a birth date. Not logged.
create or replace function public.employee_file_status(business uuid)
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
      pd.youth_until,
      e.updated_at as file_changed_at,
      (
        select max(t.updated_at) from public.employee_tax_years t
        where t.business_id = m.business_id and t.user_id = m.user_id
      ) as years_changed_at
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
      'submitted_at', p.submitted_at,
      -- greatest() passes over a null: a file never written and no 101 is null.
      'changed_at', greatest(p.file_changed_at, p.years_changed_at)
    ) end
  from people p
  cross join reader r
  where private.module_enabled(employee_file_status.business, 'employee_files'::public.module_key)
    and (r.holder or r.team)
$$;

------------------------------------------------------------------------------
-- 4. One mark at a time

-- It took the whole set (`groups text[]`), which a screen read earlier.
drop function public.set_direct_groups(uuid, uuid, uuid, text[], timestamptz);

-- A holder marks one part of a file "נמסר ישירות לשכר" (`marked`), any of
-- the groups the business asks, or takes the mark off any part, one it
-- stopped asking among them. The stored set is read under the file's lock,
-- so two holders' presses at once each keep the other's. True when the set
-- changed; false, writing nothing, when the part already was so (another
-- holder's press first), so a screen offers "ביטול" only for a change it
-- made, and an undo after someone else took that change back writes nothing.
-- The set stays in FILE_GROUPS' order. Logged employee.direct {person,
-- groups}, with the set after the change.
create function public.set_direct_groups(
  actor uuid,
  business uuid,
  person uuid,
  file_group text,
  marked boolean,
  at_time timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  person_role public.member_role;
  all_groups constant text[] := array['identity', 'address', 'bank', 'pension'];
  was_groups text[];
  new_groups text[];
begin
  perform private.check_file_writes(business);
  perform private.check_file_actor(business, actor);
  person_role := private.file_person_role(business, person);
  perform private.check_file_holder(business, actor, person_role);

  if file_group is null
    or marked is null
    or not (file_group = any (all_groups))
    or (marked and not (file_group = any (private.file_groups(business))))
  then
    raise exception 'Groups of the file only' using errcode = '22023';
  end if;

  perform private.file_lock(business, person);
  select e.direct_groups into was_groups
  from public.employee_details e
  where e.business_id = business and e.user_id = person
  for update;
  was_groups := coalesce(was_groups, '{}'::text[]);
  if (file_group = any (was_groups)) = marked then
    return false;
  end if;

  select coalesce(array_agg(g.name order by g.place), '{}'::text[])
  into new_groups
  from unnest(all_groups) with ordinality as g (name, place)
  where case when g.name = file_group then marked else g.name = any (was_groups) end;

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
  return true;
end;
$$;

------------------------------------------------------------------------------
-- 5. Who may call them

-- Replaced in place, the same signatures, so their grants stay; revoked and
-- granted again all the same.
revoke execute on function private.file_answer(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function private.pension_due_on(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.employee_file_status(uuid) from public, anon;
grant execute on function public.employee_file_status(uuid) to authenticated;

-- Made again: the secret key's alone, as before.
revoke execute on function public.set_direct_groups(uuid, uuid, uuid, text, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.set_direct_groups(uuid, uuid, uuid, text, boolean, timestamptz)
  to service_role;
