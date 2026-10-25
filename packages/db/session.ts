import "server-only";
import type { ViewSession } from "@domain/view-as";
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
  /**
   * Set while someone on the ConceptApp team views a business as a role:
   * `membership` is then that business and role, for reading only.
   */
  viewing: ViewSession | null;
};

/**
 * Who is signed in and which business they work in, read under RLS.
 * Null when nobody is signed in. A person in several businesses gets the
 * oldest membership until the business switcher arrives. Someone on the
 * ConceptApp team with an open view session gets the viewed business and
 * role instead (RLS lets them read it while the session lasts).
 */
export async function getCurrentMember(): Promise<CurrentMember | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims.sub;
  if (!userId) return null;

  const [profile, membership, view] = await Promise.all([
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
    // At most one is open (a unique index); people off the team have none.
    supabase
      .from("view_sessions")
      .select("role, businesses (id, name, accent, slug)")
      .eq("staff_id", userId)
      .is("ended_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle(),
  ]);
  if (profile.error) throw profile.error;
  if (membership.error) throw membership.error;
  if (view.error) throw view.error;

  const person = {
    userId,
    name: profile.data?.full_name ?? null,
    phone: profile.data?.phone ?? null,
  };
  const viewed = view.data?.businesses;
  if (view.data && viewed) {
    const { slug, ...business } = viewed;
    return {
      ...person,
      membership: { role: view.data.role, business },
      viewing: { role: view.data.role, businessSlug: slug },
    };
  }

  const business = membership.data?.businesses;
  return {
    ...person,
    membership:
      membership.data && business
        ? { role: membership.data.role, business }
        : null,
    viewing: null,
  };
}
