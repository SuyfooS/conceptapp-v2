-- 00-guard: the database is the local one, where nothing can leave it.
--
-- Run before anything is written, and again at the end. Each check that
-- fails is a row naming it; the seed stops on the first. Only supabase/seed.sql
-- makes dev.send_sms and dev.sms_codes (the auth hook writes codes there
-- instead of sending them), the local Vault holds no address of the app or
-- cron secret (so the database never calls the app, 20261109000500_push.sql),
-- and seed.sql turns every cron job off (a job left on would remind, clean or
-- send under the run). Neither test business is a demo, and nobody of the
-- seed has a device to push to. Each step is one statement, with no dollar
-- quote and no DO block; parts.ts splits a part at its step lines.

-- step: local
select checks.problem
from (
  values
    (case when to_regprocedure('dev.send_sms(jsonb)') is null
      then 'dev.send_sms(jsonb) is missing: only the local seed makes it, so this is not the local database' end),
    (case when to_regclass('dev.sms_codes') is null
      then 'dev.sms_codes is missing: only the local seed makes it, so this is not the local database' end),
    ((select case when count(*) > 0
      then 'Vault holds ' || string_agg(s.name, ', ') || ': the database could call the app' end
      from vault.secrets s
      where s.name in ('app_url', 'cron_secret'))),
    ((select case when count(*) > 0
      then 'Cron jobs are on: ' || string_agg(j.jobname, ', ' order by j.jobname) end
      from cron.job j
      where j.active
        and j.jobname in ('notifications', 'notifications-clean', 'payroll', 'lists',
          'list-photos', 'chat', 'order-taking', 'audit-guard'))),
    ((select case when count(*) > 0
      then 'A test business is a demo business (private.demo_businesses)' end
      from private.demo_businesses d
      where d.business_id::text like '5ca1e300-%')),
    ((select case when count(*) > 0
      then count(*) || ' devices to push to belong to people of the seed' end
      from public.push_subscriptions p
      where p.user_id::text like '5ca1e300-%'))
) as checks (problem)
where checks.problem is not null;
