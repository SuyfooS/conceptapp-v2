import "server-only";
import type { ModuleRow } from "@domain/modules";
import type { BusinessPlace } from "@domain/shabbat";
import type { ViewSession } from "@domain/view-as";
import { layerWording, type Wording } from "@domain/wording";
import type { Database } from "./database.types";
import { createClient } from "./supabase/server";

export type MemberRole = Database["public"]["Enums"]["member_role"];

export type MemberBusiness = {
  id: string;
  /** Its address in the app, unique: how the demo businesses are told apart. */
  slug: string;
  name: string;
  accent: string;
  address: string | null;
  /** Where it is, for its Shabbat times and its calendar. */
  place: BusinessPlace;
  modules: ModuleRow[];
  /** The template it was opened from, or null. */
  templateKey: string | null;
  /**
   * The sentences its template and the business itself replace, the
   * business's over the template's, as stored: the app checks them against
   * its own messages before showing them (`fittingWording`).
   */
  wording: Wording;
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

type WordingRows = {
  business: { business_id: string; key: string; sentence: string }[];
  template: { template_key: string; key: string; sentence: string }[];
};

function memberBusiness(
  row: {
    id: string;
    slug: string;
    name: string;
    accent: string;
    address: string | null;
    shabbat_city: string | null;
    timezone: string;
    template_key: string | null;
    business_modules: {
      module_key: ModuleRow["key"];
      enabled: boolean;
      settings: unknown;
    }[];
  },
  wording: WordingRows,
): MemberBusiness {
  const sentences = (rows: { key: string; sentence: string }[]): Wording =>
    Object.fromEntries(rows.map((r) => [r.key, r.sentence]));
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    accent: row.accent,
    address: row.address,
    place: { shabbatCity: row.shabbat_city, timeZone: row.timezone },
    modules: row.business_modules.map((module) => ({
      key: module.module_key,
      enabled: module.enabled,
      settings: module.settings,
    })),
    templateKey: row.template_key,
    // RLS gives the person every business they may read; keep this one's.
    wording: layerWording(
      sentences(
        wording.template.filter((w) => w.template_key === row.template_key),
      ),
      sentences(wording.business.filter((w) => w.business_id === row.id)),
    ),
  };
}

/**
 * Who is signed in and which business they work in, read under RLS. The business
 * comes with its place and its modules, since nearly every screen needs them
 * before it can read anything else; separately they cost two more rounds.
 * Null when nobody is signed in. A person in several businesses gets the
 * oldest membership until the business switcher arrives. Someone on the
 * ConceptApp team with an open view session gets the viewed business and
 * role instead (RLS lets them read it while the session lasts). The
 * business's wording is read alongside, so it costs no extra round.
 */
export async function getCurrentMember(): Promise<CurrentMember | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims.sub;
  if (!userId) return null;

  const [profile, membership, view, businessWording, templateWording] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, phone")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("memberships")
        .select(
          "role, businesses (id, name, accent, slug, address, shabbat_city, timezone, template_key, business_modules (module_key, enabled, settings))",
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
          "role, businesses (id, name, accent, slug, address, shabbat_city, timezone, template_key, business_modules (module_key, enabled, settings))",
        )
        .eq("staff_id", userId)
        .is("ended_at", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle(),
      // Only what RLS lets the person read: their businesses' sentences and
      // their templates', or the viewed business's.
      supabase.from("business_wording").select("business_id, key, sentence"),
      supabase.from("template_wording").select("template_key, key, sentence"),
    ]);
  if (profile.error) throw profile.error;
  if (membership.error) throw membership.error;
  if (view.error) throw view.error;
  if (businessWording.error) throw businessWording.error;
  if (templateWording.error) throw templateWording.error;
  const wording: WordingRows = {
    business: businessWording.data,
    template: templateWording.data,
  };

  const person = {
    userId,
    name: profile.data?.full_name ?? null,
    phone: profile.data?.phone ?? null,
  };
  const viewed = view.data?.businesses;
  if (view.data && viewed) {
    return {
      ...person,
      membership: {
        role: view.data.role,
        business: memberBusiness(viewed, wording),
      },
      viewing: { role: view.data.role, businessSlug: viewed.slug },
    };
  }

  const business = membership.data?.businesses;
  return {
    ...person,
    membership:
      membership.data && business
        ? {
            role: membership.data.role,
            business: memberBusiness(business, wording),
          }
        : null,
    viewing: null,
  };
}
