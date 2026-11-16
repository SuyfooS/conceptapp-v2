import "server-only";
import { BASE_ROLES, type NamedRole } from "@domain/role-access";
import type { ViewAsChoice, ViewAsFailure } from "@domain/view-as";
import { z } from "zod";
import { isMissingColumn } from "./missing";
import { createAdminClient } from "./supabase/admin";

/** A view that opened, or why it didn't, in the console's words. */
export type ViewStartResult =
  | { ok: true }
  | { ok: false; failure: ViewAsFailure };

/**
 * Start viewing a business's app as `choice` (`public.start_view_session`):
 * a built-in role, or a role the business named, viewed on its base (the
 * roles plan's R11c, passed as `view_named` only when there is one, so a
 * project before its migration still opens the built-in ones). Ends the
 * actor's open session, opens one for two hours, and records `view_as.start`
 * in the business's audit log. Runs with the secret key: callers check the
 * person may view as first, and the database checks again that `actorId` is
 * on the team. A named role archived since the caller read it is
 * `roleGone` (22023 with hint `archived`); anything else throws (an unknown
 * business, or a role not of the business, which the console never passes:
 * it sends an id not among the live roles to `roleGone` before calling).
 */
export async function startViewing(
  actorId: string,
  businessId: string,
  choice: ViewAsChoice,
): Promise<ViewStartResult> {
  const { error } = await createAdminClient().rpc("start_view_session", {
    actor: actorId,
    business: businessId,
    view_role: choice.role,
    ...(choice.namedRole ? { view_named: choice.namedRole.id } : {}),
  });
  if (!error) return { ok: true };
  if (choice.namedRole && error.code === "22023" && error.hint === "archived") {
    return { ok: false, failure: "roleGone" };
  }
  throw new Error(`Could not start viewing: ${error.message}`);
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

const NamedRoleRow = z.object({
  id: z.uuid(),
  base: z.enum(BASE_ROLES),
  name: z.string(),
  name_en: z.string().nullable(),
});

/**
 * The business's live named roles, in their order, for the console's "צפייה
 * באפליקציה" (the roles plan's R11c): their names and base, nothing they
 * hold. None until the database views them
 * (20261115001800_named_roles_view.sql: `view_sessions.named_role`), so the
 * console never offers a view it can't open, and none before the roles
 * exist. Read with the secret key, as the team is no member; callers check
 * first that the person may view the business as a role.
 */
export async function getViewableNamedRoles(
  businessId: string,
): Promise<NamedRole[]> {
  const admin = createAdminClient();
  const [probe, roles] = await Promise.all([
    admin.from("view_sessions").select("named_role").limit(0),
    admin
      .from("business_roles")
      .select("id, base, name, name_en")
      .eq("business_id", businessId)
      .is("archived_at", null)
      .order("sort")
      .order("created_at"),
  ]);
  if (isMissingColumn(probe.error)) return [];
  if (probe.error) throw probe.error;
  // PostgREST's and Postgres's "no such table".
  if (roles.error?.code === "PGRST205" || roles.error?.code === "42P01") {
    return [];
  }
  if (roles.error) throw roles.error;
  return z
    .array(NamedRoleRow)
    .parse(roles.data ?? [])
    .map((row) => ({
      id: row.id,
      name: row.name,
      nameEn: row.name_en,
      base: row.base,
    }));
}
