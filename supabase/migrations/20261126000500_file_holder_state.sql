-- The hiring file (profile H6a, issue #82 §2.4, §3.3): whether the
-- signed-in person may read the business's files as a holder now, asked
-- before any file is read.
--
-- public.employee_file (20261126000200_employee_files.sql) says `ack` only
-- after it logs an employee.view_denied row, so a screen that read a file
-- to learn the duties come first would log a refused attempt on every visit
-- before them, and the owner's monthly summary (H6c) would count those.
-- This answers the same gate without a log: null for nobody signed in;
-- 'off' while the module is off; else private.file_holder_gate's reason
-- ('viewing', 'not_member', 'not_holder', 'ack'), or 'ready'. About the
-- caller alone, with no value and no row of anyone's. Nothing else changes.

create function public.file_holder_state(business uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then null::text
    when not private.module_enabled(file_holder_state.business, 'employee_files'::public.module_key)
      then 'off'::text
    else coalesce(private.file_holder_gate(file_holder_state.business), 'ready'::text)
  end
$$;

-- With the person's own session, never signed out, as the file's reads.
revoke execute on function public.file_holder_state(uuid) from public, anon;
grant execute on function public.file_holder_state(uuid) to authenticated;
