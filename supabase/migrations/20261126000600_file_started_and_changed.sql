-- The hiring file (profile H6b-2, issue #82 §2.5, §2.7): what a holder's
-- screens need that the reads didn't give.
--
--   started_on  private.file_answer gives the open employment period's
--               first day (null with none), so a minor's file says when
--               the notice of the terms of work is due, a week on. The
--               periods themselves are read under the session only with
--               clock.payroll and the clock on, which a holder may lack.
--   changed_at  public.employee_file_status gives a holder, in `detail`,
--               when the file or its 101 was last written, by anyone: the
--               newer of the file's updated_at and its years' newest.
--               Never a read, and never the emergency contact (its own
--               table), so the team's desktop says "שינוי אחרון" without
--               reading every log row of the business.
--
-- It replaces private.file_answer and public.employee_file_status
-- (20261126000200_employee_files.sql's), each its newest body with only
-- these changes, the same signatures; revoked and granted again all the
-- same. Nothing else changes.

------------------------------------------------------------------------------
-- 1. The file, with the open period's start

-- The file as `reader` reads it ('self' or 'holder'): its plain part, the
-- sealed values the screens open (never the ID number or the account), the
-- wrapped key, what is missing, the 18th birthday, the pension's due date,
-- the open employment period's first day and the 101 years.
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
        and p.ended_on is null
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
-- 2. The status, with when each file last changed

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
-- 3. Who may call them

-- Replaced in place, the same signatures, so their grants stay; revoked and
-- granted again all the same.
revoke execute on function private.file_answer(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.employee_file_status(uuid) from public, anon;
grant execute on function public.employee_file_status(uuid) to authenticated;
