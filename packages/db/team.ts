import "server-only";
import type { Role } from "@domain/modules";
import {
  type AddressForm,
  addressFormOf,
  type CoverPreset,
  coverOf,
} from "@domain/profile";
import { profilePhotoSrc } from "@domain/profile-photos";
import type { TeamInvite, TeamMember } from "@domain/team";
import { isMissingColumn, isMissingFunction } from "./missing";
import { createClient } from "./supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/** An active membership with the profile its colleagues read. */
type MemberRow = {
  user_id: string;
  role: Role;
  created_at: string;
  profiles: {
    full_name: string | null;
    avatar_path: string | null;
    address_form?: string | null;
  } | null;
};

/**
 * A business's active members, as the signed-in person may read them (RLS).
 * Before 20261109000400_profile_about.sql reaches a project there is no form
 * of address yet: the members are read as before, and the copy stays neutral.
 */
async function activeMembers(
  supabase: Client,
  businessId: string,
): Promise<MemberRow[]> {
  const read = await supabase
    .from("memberships")
    .select(
      "user_id, role, created_at, profiles (full_name, avatar_path, address_form)",
    )
    .eq("business_id", businessId)
    .eq("active", true);
  if (!read.error) return read.data;
  if (!isMissingColumn(read.error)) throw read.error;
  const older = await supabase
    .from("memberships")
    .select("user_id, role, created_at, profiles (full_name, avatar_path)")
    .eq("business_id", businessId)
    .eq("active", true);
  if (older.error) throw older.error;
  return older.data;
}

const nameOf = (row: Pick<MemberRow, "profiles">) =>
  row.profiles?.full_name?.trim() || null;

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
  const [members, phoneOf, invites] = await Promise.all([
    activeMembers(supabase, businessId),
    teamPhones(supabase, businessId),
    supabase
      .from("invites")
      .select("id, full_name, phone, role, expires_at")
      .eq("business_id", businessId)
      .is("claimed_at", null),
  ]);
  if (invites.error) throw invites.error;
  return {
    members: members.map((row) => ({
      userId: row.user_id,
      name: nameOf(row),
      phone: phoneOf.get(row.user_id) ?? null,
      role: row.role,
      photo: profilePhotoSrc(row.profiles?.avatar_path),
      addressForm: addressFormOf(row.profiles?.address_form),
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

/** The business's numbers by person, for an owner or manager (none for others). */
async function teamPhones(
  supabase: Client,
  businessId: string,
): Promise<Map<string, string | null>> {
  const phones = await supabase.rpc("team_phones", { business: businessId });
  if (phones.error && !isMissingFunction(phones.error)) throw phones.error;
  return new Map(
    phones.error
      ? await phonesFromProfiles(supabase, businessId)
      : phones.data.map((row) => [row.user_id, row.phone]),
  );
}

/**
 * Before team_phones reaches a project, the numbers are still read from the
 * profiles, as before; after it, signed-in people can't read them there.
 */
async function phonesFromProfiles(
  supabase: Client,
  businessId: string,
): Promise<[string, string | null][]> {
  const { data, error } = await supabase
    .from("memberships")
    .select("user_id, profiles (phone)")
    .eq("business_id", businessId)
    .eq("active", true);
  if (error) throw error;
  return data.map((row) => [row.user_id, row.profiles?.phone ?? null]);
}

/** One member as their profile shows them to an owner or manager. */
export type TeamPerson = TeamMember & {
  /** Their line about themselves, or null. */
  bio: string | null;
  cover: CoverPreset;
  /** When they joined the business (ISO). */
  since: string;
};

/**
 * One active member of the business with their profile, as an owner or
 * manager reads them (RLS; callers check `canSeeTeam` first). Null when they
 * are not an active member. Before the profile's H2 migration reaches a
 * project, they have no line and the default cover.
 */
export async function getTeamPerson(
  businessId: string,
  personId: string,
): Promise<TeamPerson | null> {
  const supabase = await createClient();
  const [row, phoneOf] = await Promise.all([
    teamPersonRow(supabase, businessId, personId),
    teamPhones(supabase, businessId),
  ]);
  if (!row) return null;
  return {
    userId: row.user_id,
    name: nameOf(row),
    phone: phoneOf.get(row.user_id) ?? null,
    role: row.role,
    photo: profilePhotoSrc(row.profiles?.avatar_path),
    addressForm: addressFormOf(row.profiles?.address_form),
    bio: row.profiles?.bio ?? null,
    cover: coverOf(row.profiles?.cover),
    since: row.created_at,
  };
}

type PersonRow = Omit<MemberRow, "profiles"> & {
  profiles:
    | (NonNullable<MemberRow["profiles"]> & {
        bio?: string | null;
        cover?: string | null;
      })
    | null;
};

async function teamPersonRow(
  supabase: Client,
  businessId: string,
  personId: string,
): Promise<PersonRow | null> {
  const read = await supabase
    .from("memberships")
    .select(
      "user_id, role, created_at, profiles (full_name, avatar_path, bio, cover, address_form)",
    )
    .eq("business_id", businessId)
    .eq("user_id", personId)
    .eq("active", true)
    .maybeSingle();
  if (!read.error) return read.data;
  if (!isMissingColumn(read.error)) throw read.error;
  const older = await supabase
    .from("memberships")
    .select("user_id, role, created_at, profiles (full_name, avatar_path)")
    .eq("business_id", businessId)
    .eq("user_id", personId)
    .eq("active", true)
    .maybeSingle();
  if (older.error) throw older.error;
  return older.data;
}

export type Colleague = {
  userId: string;
  name: string | null;
  /** An image src for their photo (`profilePhotoSrc`), or null. */
  photo: string | null;
  /** How the app writes about them (ICU `select`), or null until they choose. */
  addressForm: AddressForm | null;
};

/**
 * The names, photos and forms of address of a business's active members, as
 * anyone in it may read them (RLS): for the published schedule, which every
 * member reads.
 */
export async function getColleagues(businessId: string): Promise<Colleague[]> {
  const supabase = await createClient();
  const members = await activeMembers(supabase, businessId);
  return members.map((row) => ({
    userId: row.user_id,
    name: nameOf(row),
    photo: profilePhotoSrc(row.profiles?.avatar_path),
    addressForm: addressFormOf(row.profiles?.address_form),
  }));
}
