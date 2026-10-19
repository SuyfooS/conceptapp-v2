import "server-only";
import type { NewBusiness } from "@domain/business";
import type { PlatformRole } from "@domain/platform";
import { z } from "zod";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

export type PlatformStaff = { userId: string; role: PlatformRole };

/**
 * The signed-in person and their role on the ConceptApp team, or null when
 * they are not on it (or nobody is signed in). Read under RLS: people see
 * only their own `platform_staff` row.
 */
export async function getPlatformStaff(): Promise<PlatformStaff | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims.sub;
  if (!userId) return null;
  const { data, error } = await supabase
    .from("platform_staff")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? { userId, role: data.role } : null;
}

/** The signed-in person's role on the ConceptApp team, or null. */
export async function getPlatformRole(): Promise<PlatformRole | null> {
  return (await getPlatformStaff())?.role ?? null;
}

// Generated types lose nullability for function results, so the rows are
// checked here.
const AdminBusiness = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  accent: z.string(),
  template_key: z.string().nullable(),
  created_at: z.string(),
  members: z.number().int().nonnegative(),
  open_invites: z.number().int().nonnegative(),
});

export type AdminBusiness = {
  id: string;
  slug: string;
  name: string;
  accent: string;
  templateKey: string | null;
  createdAt: string;
  members: number;
  openInvites: number;
};

/**
 * Every business, newest first, with active members and open invites.
 * `public.admin_businesses` refuses anyone off the team, so this throws for
 * them; callers check `getPlatformRole` first.
 */
export async function listBusinesses(): Promise<AdminBusiness[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_businesses");
  if (error) throw error;
  return z
    .array(AdminBusiness)
    .parse(data)
    .map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      accent: row.accent,
      templateKey: row.template_key,
      createdAt: row.created_at,
      members: row.members,
      openInvites: row.open_invites,
    }));
}

export type CreateBusinessResult =
  | { ok: true; id: string }
  | { ok: false; error: "slugTaken" };

/**
 * Opens a business and sets it up from its template, in one transaction
 * (`public.create_business`), and records `actorId` in the audit log. Runs
 * with the secret key: callers check the person may create businesses
 * first, and the database checks again that `actorId` is on the team. A
 * taken slug comes back as an error to show; anything else throws.
 */
export async function createBusiness(
  actorId: string,
  business: NewBusiness,
): Promise<CreateBusinessResult> {
  const { data, error } = await createAdminClient().rpc("create_business", {
    actor: actorId,
    name: business.name,
    slug: business.slug,
    address: business.address ?? "",
    accent: business.accent,
    template: business.template,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "slugTaken" };
    throw new Error(`Could not create business: ${error.message}`);
  }
  return { ok: true, id: z.uuid().parse(data) };
}
