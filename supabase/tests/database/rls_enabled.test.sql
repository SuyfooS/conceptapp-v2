-- Meta-test: every table in `public` has row-level security switched on.
-- A new table without RLS fails here, and so CI.
begin;
select plan(2);

select is_empty(
  $$
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
  $$,
  'every table in public has row-level security'
);

select set_eq(
  $$
    select c.relname::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  $$,
  array[
    'templates', 'businesses', 'profiles', 'memberships',
    'template_wording', 'business_wording',
    'business_modules', 'invites', 'audit_log', 'platform_staff',
    'view_sessions', 'schedule_weeks', 'availability_submissions',
    'availability_ranges', 'schedule_shifts', 'shift_assignments',
    'shift_swaps', 'time_entries', 'punch_codes', 'time_breaks'
  ],
  'the tenancy tables exist (update this list with each new table)'
);

select * from finish();
rollback;
