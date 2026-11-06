import "server-only";
import type { ModuleRow } from "@domain/modules";
import type { ViewSession } from "@domain/view-as";
import type { BusinessPlace } from "./availability";
import type { Database } from "./database.types";
import { createClient } from "./supabase/server";

export type MemberRole = Database["public"]["Enums"]["member_role"];

export type MemberBusiness = {
  id: string;
  name: string;
  accent: string;
  /** Where it is, for its Shabbat times and its calendar. */
  place: BusinessPlace;
  modules: ModuleRow[];
};

export type CurrentMember = {
  userId: string;
  name: string | null;
  phone: string | null;
  /** The business the person works in, or null before anyone added them. */
  membership: {
    role: MemberRole;
    business: MemberBusiness;
  } | null;
  /**
   * Set while someone on the ConceptApp team views a business as a role:
   * `membership` is then that business and role, for reading only.
   */
  viewing: ViewSession | null;
};

function memberBusiness(row: {
  id: string;
  name: string;
  accent: string;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  business_modules: {
    module_key: ModuleRow["key"];
    enabled: boolean;
    settings: unknown;
  }[];
}): MemberBusiness {
  return {
    id: row.id,
    name: row.name,
    accent: row.accent,
    place: {
      latitude: row.latitude,
      longitude: row.longitude,
      timeZone: row.timezone,
    },
    modules: row.business_modules.map((module) => ({
      key: module.module_key,
      enabled: module.enabled,
      settings: module.settings,
    })),
  };
}

/**
 * Who is signed in and which business they work in, read under RLS. The business
 * comes with its place and its modules, since nearly every screen needs them
 * before it can read anything else; separately they cost two more rounds.
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
      .select(
        "role, businesses (id, name, accent, latitude, longitude, timezone, business_modules (module_key, enabled, settings))",
      )
      .eq("user_id", userId)
      .eq("active", true)
      .order("created_at")
      .limit(1)
      .maybeSingle(),
    // At most one is open (a unique index); people off the team have none.
    supabase
      .from("view_sessions")
      .select(
        "role, businesses (id, name, accent, slug, latitude, longitude, timezone, business_modules (module_key, enabled, settings))",
      )
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
    return {
      ...person,
      membership: { role: view.data.role, business: memberBusiness(viewed) },
      viewing: { role: view.data.role, businessSlug: viewed.slug },
    };
  }

  const business = membership.data?.businesses;
  return {
    ...person,
    membership:
      membership.data && business
        ? { role: membership.data.role, business: memberBusiness(business) }
        : null,
    viewing: null,
  };
}
