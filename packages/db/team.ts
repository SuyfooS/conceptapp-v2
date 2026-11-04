import "server-only";
import type { TeamInvite, TeamMember } from "@domain/team";
import { createClient } from "./supabase/server";

/**
 * The people of a business for its Team screen: active members with their
 * profile, and invites nobody has claimed yet (open or expired). Read as
 * the signed-in person under RLS, so only a manager or owner of the
 * business gets the invites; callers check `canSeeTeam` first.
 */
export async function getTeam(
  businessId: string,
): Promise<{ members: TeamMember[]; invites: TeamInvite[] }> {
  const supabase = await createClient();
  const [members, invites] = await Promise.all([
    supabase
      .from("memberships")
      .select("user_id, role, profiles (full_name, phone)")
      .eq("business_id", businessId)
      .eq("active", true),
    supabase
      .from("invites")
      .select("id, full_name, phone, role, expires_at")
      .eq("business_id", businessId)
      .is("claimed_at", null),
  ]);
  if (members.error) throw members.error;
  if (invites.error) throw invites.error;
  return {
    members: members.data.map((row) => ({
      userId: row.user_id,
      name: row.profiles?.full_name?.trim() || null,
      phone: row.profiles?.phone ?? null,
      role: row.role,
    })),
    invites: invites.data.map((row) => ({
      id: row.id,
      name: row.full_name?.trim() || null,
      phone: row.phone,
      role: row.role,
      expiresAt: row.expires_at,
    })),
  };
}

export type Colleague = { userId: string; name: string | null };

/**
 * The names of a business's active members, as anyone in it may read them
 * (RLS): for the published schedule, which every member reads.
 */
export async function getColleagues(businessId: string): Promise<Colleague[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("user_id, profiles (full_name)")
    .eq("business_id", businessId)
    .eq("active", true);
  if (error) throw error;
  return data.map((row) => ({
    userId: row.user_id,
    name: row.profiles?.full_name?.trim() || null,
  }));
}
