import "server-only";
import type { Role } from "@domain/modules";
import { z } from "zod";
import { createAdminClient } from "./supabase/admin";

/**
 * Start viewing a business's app as `role` (`public.start_view_session`):
 * ends the actor's open session, opens one for two hours, and records
 * `view_as.start` in the business's audit log. Runs with the secret key:
 * callers check the person may view as first, and the database checks
 * again that `actorId` is on the team. Throws for anyone else or an
 * unknown business.
 */
export async function startViewing(
  actorId: string,
  businessId: string,
  role: Role,
): Promise<void> {
  const { error } = await createAdminClient().rpc("start_view_session", {
    actor: actorId,
    business: businessId,
    view_role: role,
  });
  if (error) throw new Error(`Could not start viewing: ${error.message}`);
}

/**
 * Stop viewing (`public.end_view_session`) and record `view_as.end`.
 * Nothing happens when no session is open.
 */
export async function stopViewing(actorId: string): Promise<void> {
  const { data, error } = await createAdminClient().rpc("end_view_session", {
    actor: actorId,
  });
  if (error) throw new Error(`Could not stop viewing: ${error.message}`);
  // Null when there was no open session; generated types lose that.
  z.uuid().nullable().parse(data);
}
