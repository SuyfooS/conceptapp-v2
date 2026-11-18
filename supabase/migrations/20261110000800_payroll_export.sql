-- The file for payroll (payroll P8; Orel, 9 November 2026, issue #1): a
-- month's hours as a generic Hebrew XLSX for whoever runs the payroll, built by
-- the app from what the pay screens read and kept nowhere. No estimate and no
-- amount worked out in it, not even on a summary sheet, and no ID numbers.
--
--   the log   public.note_payroll_export: someone holding clock.payroll, or
--             the ConceptApp team viewing as an accountant, takes a month's
--             file. Logged as payroll.export before the file is sent, with the
--             person's own session: when the row can't be written, no file
--             goes out. Every file is a row (unlike payroll.view, once a day).
--             A pay row: only pay holders read it, and the activity list shows
--             it.
--
-- No table. H6 (the hiring file) adds a recipient and ID numbers through a
-- function of its own.

------------------------------------------------------------------------------
-- 1. Taking the file

-- `pay_month` is the month of the file (any day of it); `person_count` and
-- `shift_count` how many people and shifts it lists; `engine_version` the
-- version of the hours engine that worked out its rates (@domain/payroll's
-- PAYROLL_ENGINE_VERSION). Anyone else is refused (42501), so the app never
-- sends them a file. Parameters are named apart from audit_log's columns.
create function public.note_payroll_export(
  business uuid,
  pay_month date,
  person_count integer,
  shift_count integer,
  engine_version text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if pay_month is null then
    raise exception 'Say which month the file is for' using errcode = '22023';
  end if;

  if person_count is null or person_count < 0
    or shift_count is null or shift_count < 0
  then
    raise exception 'Say how many people and shifts the file holds'
      using errcode = '22023';
  end if;

  if engine_version is null
    or char_length(btrim(engine_version)) not between 1 and 40
  then
    raise exception 'Say which hours engine made the file' using errcode = '22023';
  end if;

  if me is null
    or not private.module_enabled(business, 'time_clock'::public.module_key)
    or not (
      private.has_perm(business, 'clock.payroll'::text)
      or private.viewing_payroll(business)
    )
  then
    raise exception 'Only pay holders take the file for payroll'
      using errcode = '42501';
  end if;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, me, 'payroll.export',
    jsonb_build_object(
      'month', to_char(pay_month, 'YYYY-MM'),
      'format', 'xlsx',
      'people', person_count,
      'shifts', shift_count,
      'ids', false,
      'engine', btrim(engine_version)
    )
  );
end;
$$;

comment on function public.note_payroll_export(uuid, date, integer, integer, text) is
  'A pay holder (or the team viewing as an accountant) takes a month''s file for payroll: logged as payroll.export before the file goes out, with the person''s own session. Refuses anyone else (42501).';

------------------------------------------------------------------------------
-- 2. Who may call it

revoke execute on function public.note_payroll_export(uuid, date, integer, integer, text)
  from public, anon;
grant execute on function public.note_payroll_export(uuid, date, integer, integer, text)
  to authenticated;
