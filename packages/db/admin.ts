import "server-only";
import type { PlatformRole } from "@domain/platform";
import { z } from "zod";
import { createClient } from "./supabase/server";

/**
 * The signed-in person's role on the ConceptApp team, or null when they are
 * not on it (or nobody is signed in). Read under RLS: people see only their
 * own `platform_staff` row.
 */
export async function getPlatformRole(): Promise<PlatformRole | null> {
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
  return data?.role ?? null;
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
