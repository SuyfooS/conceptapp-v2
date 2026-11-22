import "server-only";
import { z } from "zod";
import { isMissingFunction } from "./missing";
import { createAdminClient } from "./supabase/admin";

/*
 * The log's nightly check (profile H4, 20261126000200_employee_files.sql):
 * the job audit-guard writes what is missing of the log's triggers and
 * revokes and of the hiring file's tables, every night. The console's card
 * that shows it is H6's; this reads the newest run with the secret key, for
 * the team only. Null before the first run, and before the migration.
 */

const Run = z.object({
  checked_at: z.string(),
  problems: z.array(z.string()),
});

export async function getAuditGuard(): Promise<{
  checkedAt: string;
  problems: string[];
} | null> {
  const { data, error } = await createAdminClient().rpc("audit_guard_status");
  if (error) {
    if (isMissingFunction(error)) return null;
    throw error;
  }
  const run = Run.nullable().safeParse(data);
  if (!run.success || run.data === null) return null;
  return { checkedAt: run.data.checked_at, problems: run.data.problems };
}
