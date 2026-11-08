import "server-only";
import type { TeamInvite, TeamMember } from "@domain/team";
import { isMissingFunction } from "./missing";
import { createClient } from "./supabase/server";

/**
 * The people of a business for its Team screen: active members with their
 * profile, and invites nobody has claimed yet (open or expired). Read as
 * the signed-in person under RLS, so only a manager or owner of the
 * business gets the invites and the numbers (`public.team_phones`; members
 * read each other's names only); callers check `canSeeTeam` first.
 */
export async function getTeam(
  businessId: string,
): Promise<{ members: TeamMember[]; invites: TeamInvite[] }> {
  const supabase = await createClient();
  const [members, phones, invites] = await Promise.all([
    supabase
      .from("memberships")
      .select("user_id, role, profiles (full_name)")
      .eq("business_id", businessId)
      .eq("active", true),
    supabase.rpc("team_phones", { business: businessId }),
    supabase
      .from("invites")
      .select("id, full_name, phone, role, expires_at")
      .eq("business_id", businessId)
      .is("claimed_at", null),
  ]);
  if (members.error) throw members.error;
  if (phones.error && !isMissingFunction(phones.error)) throw phones.error;
  if (invites.error) throw invites.error;
  const phoneOf = new Map(
    phones.error
      ? await phonesFromProfiles(businessId)
      : phones.data.map((row) => [row.user_id, row.phone]),
  );
  return {
    members: members.data.map((row) => ({
      userId: row.user_id,
      name: row.profiles?.full_name?.trim() || null,
      phone: phoneOf.get(row.user_id) ?? null,
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

/**
 * Before team_phones reaches a project, the numbers are still read from the
 * profiles, as before; after it, signed-in people can't read them there.
 */
async function phonesFromProfiles(
  businessId: string,
): Promise<[string, string | null][]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("user_id, profiles (phone)")
    .eq("business_id", businessId)
    .eq("active", true);
  if (error) throw error;
  return data.map((row) => [row.user_id, row.profiles?.phone ?? null]);
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
