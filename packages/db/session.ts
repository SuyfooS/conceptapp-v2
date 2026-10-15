import "server-only";
import type { Database } from "./database.types";
import { createClient } from "./supabase/server";

export type MemberRole = Database["public"]["Enums"]["member_role"];

export type CurrentMember = {
  userId: string;
  name: string | null;
  phone: string | null;
  /** The business the person works in, or null before anyone added them. */
  membership: {
    role: MemberRole;
    business: { id: string; name: string; accent: string };
  } | null;
};

/**
 * Who is signed in and which business they work in, read under RLS.
 * Null when nobody is signed in. A person in several businesses gets the
 * oldest membership until the business switcher arrives.
 */
export async function getCurrentMember(): Promise<CurrentMember | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims.sub;
  if (!userId) return null;

  const [profile, membership] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("memberships")
      .select("role, businesses (id, name, accent)")
      .eq("user_id", userId)
      .eq("active", true)
      .order("created_at")
      .limit(1)
      .maybeSingle(),
  ]);
  if (profile.error) throw profile.error;
  if (membership.error) throw membership.error;

  const business = membership.data?.businesses;
  return {
    userId,
    name: profile.data?.full_name ?? null,
    phone: profile.data?.phone ?? null,
    membership:
      membership.data && business
        ? { role: membership.data.role, business }
        : null,
  };
}
