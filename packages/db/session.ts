import "server-only";
import type { ModuleRow } from "@domain/modules";
import {
  NO_UNREAD,
  type UnreadCounts,
  unreadCounts,
} from "@domain/notifications";
import type { BusinessPlace } from "@domain/shabbat";
import type { ViewSession } from "@domain/view-as";
import type { Wording } from "@domain/wording";
import type { Database } from "./database.types";
import { isMissingFunction } from "./missing";
import { isMissingTable } from "./notifications";
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
   * The sentences its template and the business itself replace, as stored,
   * each layer apart: the app checks each against its own messages before
   * the business's go over the template's (`shownWording`).
   */
  wording: { template: Wording; business: Wording };
};

export type CurrentMember = {
  userId: string;
  name: string | null;
  phone: string | null;
  /** The stored photo's path (`profiles.avatar_path`), or null. */
  photoPath: string | null;
  /** The business the person works in, or null before anyone added them. */
  membership: {
    role: MemberRole;
    business: MemberBusiness;
    /** When they joined it (ISO); null while viewing as a role. */
    since: string | null;
  } | null;
  /**
   * Set while someone on the ConceptApp team views a business as a role:
   * `membership` is then that business and role, for reading only.
   */
  viewing: ViewSession | null;
  /**
   * The person's own unread lines in `membership`'s business: all of them for
   * the bell, and those that need them to act for the Home tab. None while
   * viewing as someone.
   */
  unread: UnreadCounts;
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
    wording: {
      template: sentences(
        wording.template.filter((w) => w.template_key === row.template_key),
      ),
      business: sentences(
        wording.business.filter((w) => w.business_id === row.id),
      ),
    },
  };
}

/**
 * A wording table the database doesn't have yet (PostgREST's PGRST205, or
 * Postgres's 42P01): code that reads it can ship before its migration
 * reaches a project, and the app then shows its own sentences instead of
 * failing every page. Any other error still throws.
 */
function wordingRows<T>(result: {
  data: T[] | null;
  error: { code?: string } | null;
}): T[] {
  if (!result.error) return result.data ?? [];
  if (result.error.code === "PGRST205" || result.error.code === "42P01") {
    return [];
  }
  throw result.error;
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

  // Alongside the round below: the business is only known once it is back, so
  // the person's unread lines in every business they read come with it, and
  // are counted for the chosen one. RLS keeps only lines still for them.
  const unreadLines = Promise.resolve(
    supabase
      .from("notifications")
      .select("business_id, kind")
      .eq("user_id", userId)
      .is("read_at", null)
      .limit(200),
  );
  const [profile, phone, membership, view, businessWording, templateWording] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, avatar_path")
        .eq("id", userId)
        .maybeSingle(),
      // Numbers are not read from the table, the person's own included.
      supabase.rpc("own_phone"),
      supabase
        .from("memberships")
        .select(
          "role, created_at, businesses (id, name, accent, slug, address, shabbat_city, timezone, template_key, business_modules (module_key, enabled, settings))",
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
  // Before its migration reaches a project there is no own_phone yet, and
  // the number is still read from the table, as before.
  if (phone.error && !isMissingFunction(phone.error)) throw phone.error;
  const ownPhone = phone.error
    ? ((
        await supabase
          .from("profiles")
          .select("phone")
          .eq("id", userId)
          .maybeSingle()
      ).data?.phone ?? null)
    : (phone.data ?? null);
  if (membership.error) throw membership.error;
  if (view.error) throw view.error;
  const unread = await unreadLines;
  if (unread.error && !isMissingTable(unread.error)) throw unread.error;
  const unreadRows = unread.data ?? [];
  const wording: WordingRows = {
    business: wordingRows(businessWording),
    template: wordingRows(templateWording),
  };

  const person = {
    userId,
    name: profile.data?.full_name ?? null,
    phone: ownPhone,
    photoPath: profile.data?.avatar_path ?? null,
  };
  const viewed = view.data?.businesses;
  if (view.data && viewed) {
    return {
      ...person,
      membership: {
        role: view.data.role,
        business: memberBusiness(viewed, wording),
        since: null,
      },
      viewing: { role: view.data.role, businessSlug: viewed.slug },
      unread: NO_UNREAD,
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
            since: membership.data.created_at,
          }
        : null,
    viewing: null,
    unread: business ? unreadCounts(unreadRows, business.id) : NO_UNREAD,
  };
}
