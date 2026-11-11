import "server-only";
import {
  BUSINESS_COOKIE,
  chosenMembership,
  switcherOrder,
} from "@domain/businesses";
import type { ModuleRow } from "@domain/modules";
import {
  NO_UNREAD,
  type UnreadCounts,
  unreadCounts,
} from "@domain/notifications";
import {
  type AddressForm,
  addressFormOf,
  type CoverPreset,
  coverOf,
} from "@domain/profile";
import type { BusinessPlace } from "@domain/shabbat";
import type { ViewSession } from "@domain/view-as";
import type { Wording } from "@domain/wording";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { isMissingColumn, isMissingFunction } from "./missing";
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
  /**
   * What their colleagues read about them besides the photo: the line about
   * themselves, the cover, how the app addresses them. `ready` is false
   * before 20261109000400_profile_about.sql reaches the project, when none of
   * them can be stored yet.
   */
  profile: OwnProfile;
  /** The business the person works in, or null before anyone added them. */
  membership: {
    role: MemberRole;
    /**
     * Every permission they hold in the business, as the database says
     * (`public.my_permissions`): their role's, those given to their role, and
     * those given to them (`clock.payroll` always for an owner or an
     * accountant). While viewing as a role, what that role holds by default,
     * and `clock.payroll` only as an accountant. Before
     * 20261110000300_payroll_access.sql reaches a project, `memberships.perms`
     * alone, as before (none while viewing).
     */
    perms: string[];
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
  /**
   * Every business the person is active in (payroll P3b), `membership`'s
   * among them, in the switcher's order: their place on a staff first, then
   * by name. One for nearly everyone; none while viewing as someone.
   */
  businesses: OwnBusiness[];
};

/** One of the businesses a person is active in. */
export type OwnBusiness = {
  business: MemberBusiness;
  role: MemberRole;
  /** When they joined it (ISO). */
  since: string;
  /** Their unread lines there, as `CurrentMember.unread` counts them. */
  unread: UnreadCounts;
};

export type OwnProfile = {
  bio: string | null;
  cover: CoverPreset;
  addressForm: AddressForm | null;
  ready: boolean;
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
 * At most this many unread lines are read for a count: more than the bell
 * shows ("99+") and enough that those needing the person aren't cut short.
 */
const UNREAD_READ = 200;

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
 * Null when nobody is signed in. A person in several businesses (payroll
 * P3b) works in the one the `ca_business` cookie names, checked here against
 * their active memberships on every request and never trusted alone; else
 * their place on a staff, else the business they joined first
 * (`chosenMembership`). Someone on the ConceptApp team with an open view
 * session gets the viewed business and role instead (RLS lets them read it
 * while the session lasts). The business's wording is read alongside, so it
 * costs no extra round.
 */
export async function getCurrentMember(): Promise<CurrentMember | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims.sub;
  if (!userId) return null;
  const chosen = (await cookies()).get(BUSINESS_COOKIE)?.value ?? null;

  // Alongside the round below: the business is only known once it is back, so
  // the person's unread lines in every business they read come with it, and
  // are counted for the one they are in. RLS keeps only lines still for them.
  // Someone in several businesses has each counted on its own after it
  // (`unreadIn`), so one business's lines never crowd out another's.
  const unreadLines = Promise.resolve(
    supabase
      .from("notifications")
      .select("business_id, kind")
      .eq("user_id", userId)
      .is("read_at", null)
      .limit(UNREAD_READ),
  );
  const [profile, phone, memberships, view, businessWording, templateWording] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, avatar_path, bio, cover, address_form")
        .eq("id", userId)
        .maybeSingle(),
      // Numbers are not read from the table, the person's own included.
      supabase.rpc("own_phone"),
      // Every business they are active in: one place on a staff at most, and
      // any number as an accountant (20261110000900_several_businesses.sql).
      supabase
        .from("memberships")
        .select(
          "role, perms, created_at, businesses (id, name, accent, slug, address, shabbat_city, timezone, template_key, business_modules (module_key, enabled, settings))",
        )
        .eq("user_id", userId)
        .eq("active", true)
        .order("created_at"),
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
  if (profile.error && !isMissingColumn(profile.error)) throw profile.error;
  // Before the profile's H2 migration reaches a project, the name and the
  // photo are read as before, and nothing else about the person can be kept.
  const own = profile.error
    ? await olderProfile(supabase, userId)
    : profile.data
      ? { ...profile.data, ready: true }
      : null;
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
  if (memberships.error) throw memberships.error;
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
    name: own?.full_name ?? null,
    phone: ownPhone,
    photoPath: own?.avatar_path ?? null,
    profile: {
      bio: own?.bio ?? null,
      cover: coverOf(own?.cover),
      addressForm: addressFormOf(own?.address_form),
      ready: own?.ready ?? true,
    },
  };
  const viewed = view.data?.businesses;
  if (view.data && viewed) {
    return {
      ...person,
      membership: {
        role: view.data.role,
        perms: await permissionsIn(supabase, viewed.id, []),
        business: memberBusiness(viewed, wording),
        since: null,
      },
      viewing: { role: view.data.role, businessSlug: viewed.slug },
      unread: NO_UNREAD,
      businesses: [],
    };
  }

  // RLS shows a person every business they are in; a row whose business it
  // hides is no place to open.
  const places = (memberships.data ?? []).flatMap((row) =>
    row.businesses
      ? [
          {
            businessId: row.businesses.id,
            role: row.role,
            since: row.created_at,
            perms: row.perms,
            business: memberBusiness(row.businesses, wording),
          },
        ]
      : [],
  );
  const picked = chosenMembership(places, chosen);
  // One business: the lines read alongside are all its own. Several: each
  // business's lines read on their own, together and with the permissions,
  // so one business's lines never crowd out another's count.
  const [counts, perms] = await Promise.all([
    places.length > 1
      ? Promise.all(
          places.map(
            async (m) =>
              [
                m.businessId,
                await unreadIn(supabase, userId, m.businessId),
              ] as const,
          ),
        )
      : places.map(
          (m) =>
            [m.businessId, unreadCounts(unreadRows, m.businessId)] as const,
        ),
    picked
      ? permissionsIn(supabase, picked.businessId, picked.perms)
      : Promise.resolve([]),
  ]);
  const counted = new Map<string, UnreadCounts>(counts);
  const unreadOf = (businessId: string) => counted.get(businessId) ?? NO_UNREAD;
  const businesses: OwnBusiness[] = switcherOrder(places, (m) => ({
    role: m.role,
    name: m.business.name,
  })).map((m) => ({
    business: m.business,
    role: m.role,
    since: m.since,
    unread: unreadOf(m.businessId),
  }));
  return {
    ...person,
    membership: picked
      ? {
          role: picked.role,
          perms,
          business: picked.business,
          since: picked.since,
        }
      : null,
    viewing: null,
    unread: picked ? unreadOf(picked.businessId) : NO_UNREAD,
    businesses,
  };
}

/** The signed-in person's own place, as a route polled often reads it. */
export type OwnPlace = {
  userId: string;
  /**
   * The business the app opens for them among their own active memberships
   * (the `ca_business` cookie's when it is one of theirs, as
   * `getCurrentMember` chooses), or null in none.
   */
  place: {
    businessId: string;
    role: MemberRole;
    /** The modules on there. */
    enabled: ModuleRow["key"][];
  } | null;
  /** A view session is open: the app shows the viewed business instead. */
  viewing: boolean;
};

/**
 * Who is signed in and the business they work in, in one round of two reads
 * and nothing more: for `/chat-sync`, which a chat screen asks every few
 * seconds, where `getCurrentMember`'s profile, wording and counts would cost
 * five more. Under the person's own session, which this renews when it has
 * expired (the cookies go out with the answer, as in a route handler they
 * can); null when nobody is signed in.
 */
export async function getOwnPlace(): Promise<OwnPlace | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims.sub;
  if (!userId) return null;
  const chosen = (await cookies()).get(BUSINESS_COOKIE)?.value ?? null;
  const [memberships, view] = await Promise.all([
    supabase
      .from("memberships")
      .select(
        "business_id, role, created_at, businesses (business_modules (module_key, enabled))",
      )
      .eq("user_id", userId)
      .eq("active", true),
    supabase
      .from("view_sessions")
      .select("id")
      .eq("staff_id", userId)
      .is("ended_at", null)
      .gt("expires_at", new Date().toISOString())
      .limit(1),
  ]);
  if (memberships.error) throw memberships.error;
  if (view.error) throw view.error;
  const places = (memberships.data ?? []).flatMap((row) =>
    row.businesses
      ? [
          {
            businessId: row.business_id,
            role: row.role,
            since: row.created_at,
            enabled: row.businesses.business_modules
              .filter((module) => module.enabled)
              .map((module) => module.module_key),
          },
        ]
      : [],
  );
  const picked = chosenMembership(places, chosen);
  return {
    userId,
    place: picked
      ? {
          businessId: picked.businessId,
          role: picked.role,
          enabled: picked.enabled,
        }
      : null,
    viewing: (view.data ?? []).length > 0,
  };
}

/** The person's unread lines in one business, counted (payroll P3b). */
async function unreadIn(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  businessId: string,
): Promise<UnreadCounts> {
  const { data, error } = await supabase
    .from("notifications")
    .select("business_id, kind")
    .eq("user_id", userId)
    .eq("business_id", businessId)
    .is("read_at", null)
    .limit(UNREAD_READ);
  if (error && !isMissingTable(error)) throw error;
  return unreadCounts(data ?? [], businessId);
}

/**
 * What the person holds in the business, from `public.my_permissions`; the
 * permissions given to them alone (`given`) while the function is missing.
 */
async function permissionsIn(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  given: string[],
): Promise<string[]> {
  const { data, error } = await supabase.rpc("my_permissions", {
    business: businessId,
  });
  if (!error) return data ?? [];
  if (isMissingFunction(error)) return given;
  throw error;
}

type ProfileRow = {
  full_name: string | null;
  avatar_path: string | null;
  bio: string | null;
  cover: string | null;
  address_form: string | null;
  ready: boolean;
};

/** The profile as it was read before its H2 columns existed. */
async function olderProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("full_name, avatar_path")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data
    ? { ...data, bio: null, cover: null, address_form: null, ready: false }
    : null;
}
