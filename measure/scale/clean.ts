import type postgres from "postgres";
import { stepsOf } from "./parts";

/**
 * Takes the test business, its neighbour and their people away again, in
 * the caller's transaction, as e2e/db.ts removes a real business: files
 * first, then the records only the purge may delete (the log, hours, pay
 * and documents are kept against deletes, 20261110000100_hours_kept.sql),
 * then the businesses, then the logins with the seed's prefix, which takes
 * their profiles and the console's admin with them. Then it checks that
 * nothing of the prefix is left, or stops naming what is.
 */

export type CleanOptions = {
  /**
   * Removes files really uploaded to Storage (the measuring run's month of
   * payslips, PR 3a), through the Storage API so their bytes go too. The
   * rows of files that never had bytes (the seed's) go by SQL below.
   */
  storage?: (paths: string[]) => Promise<void>;
};

const SQL = `
-- step: uploaded
select o.name from storage.objects o
where o.bucket_id in ('documents', 'chat-files')
  and (o.name like '5ca1e300-0000-4000-b000-000000000300/%'
    or o.name like '5ca1e300-0000-4000-b000-000000000007/%')

-- step: allow
select set_config('storage.allow_delete_query', 'true', true)

-- step: objects
delete from storage.objects o
where o.bucket_id in ('documents', 'chat-files')
  and (o.name like '5ca1e300-0000-4000-b000-000000000300/%'
    or o.name like '5ca1e300-0000-4000-b000-000000000007/%')

-- step: purge
select private.purge_business_records(b.id)
from public.businesses b
where b.id::text like '5ca1e300-%'

-- step: businesses
delete from public.businesses b where b.id::text like '5ca1e300-%'

-- step: logins
delete from auth.users u where u.id::text like '5ca1e300-%'

-- step: left
select checks.problem
from (
  values
    ((select case when count(*) > 0 then count(*) || ' logins left' end
      from auth.users u where u.id::text like '5ca1e300-%')),
    ((select case when count(*) > 0 then count(*) || ' profiles left' end
      from public.profiles p where p.id::text like '5ca1e300-%')),
    ((select case when count(*) > 0 then count(*) || ' memberships left' end
      from public.memberships m where m.business_id::text like '5ca1e300-%'
        or m.user_id::text like '5ca1e300-%')),
    ((select case when count(*) > 0 then count(*) || ' invites left' end
      from public.invites i where i.business_id::text like '5ca1e300-%')),
    ((select case when count(*) > 0 then count(*) || ' notifications left' end
      from public.notifications n where n.business_id::text like '5ca1e300-%'
        or n.user_id::text like '5ca1e300-%')),
    ((select case when count(*) > 0 then count(*) || ' log rows left' end
      from public.audit_log a where a.business_id::text like '5ca1e300-%')),
    ((select case when count(*) > 0 then count(*) || ' time entries left' end
      from public.time_entries e where e.business_id::text like '5ca1e300-%')),
    ((select case when count(*) > 0 then count(*) || ' Storage rows left' end
      from storage.objects o where o.name like '5ca1e300-%')),
    ((select case when count(*) > 0 then count(*) || ' devices left' end
      from public.push_subscriptions p where p.user_id::text like '5ca1e300-%'))
) as checks (problem)
where checks.problem is not null
`;

export async function removeScaleBusiness(
  tx: postgres.TransactionSql,
  options: CleanOptions = {},
): Promise<void> {
  const steps = new Map(stepsOf(SQL, "clean").map((s) => [s.name, s]));
  const run = async (name: string) => {
    const step = steps.get(name);
    if (!step) throw new Error(`clean has no step ${name}`);
    try {
      return (await tx.unsafe(step.text)) as unknown as Record<
        string,
        unknown
      >[];
    } catch (error) {
      const e = error as { message?: string; detail?: string };
      throw new Error(
        `Removing the scale business stopped at ${name}: ${e.message ?? String(error)}${e.detail ? ` (${e.detail})` : ""}`,
        { cause: error },
      );
    }
  };
  if (options.storage) {
    const paths = (await run("uploaded")).map((row) => String(row.name));
    if (paths.length > 0) await options.storage(paths);
  }
  await run("allow");
  await run("objects");
  await run("purge");
  await run("businesses");
  await run("logins");
  const left = (await run("left"))
    .map((row) => row.problem)
    .filter((p): p is string => typeof p === "string");
  if (left.length > 0) {
    throw new Error(
      `Removing the scale business left rows behind:\n  ${left.join("\n  ")}`,
    );
  }
}
