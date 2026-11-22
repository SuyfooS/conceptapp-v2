import "server-only";
import { dateIn } from "@domain/availability";
import { ROLES, type Role } from "@domain/modules";
import {
  type AddressForm,
  addressFormOf,
  type CoverPreset,
  coverOf,
} from "@domain/profile";
import { profilePhotoSrc } from "@domain/profile-photos";
import { BASE_ROLES, type NamedRole } from "@domain/role-access";
import {
  countShiftsAhead,
  type LeftCounts,
  type RoleChoice,
  type TeamChangeFailure,
  type TeamInvite,
  type TeamMember,
  teamChangeFailureOf,
} from "@domain/team";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "./database.types";
import { type MemberNames, memberNames, nameIn } from "./member-names";
import { isMissingColumn, isMissingFunction } from "./missing";
import { allPages, readAllPages } from "./pages";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/** An active membership with the profile its colleagues read. */
type MemberRow = {
  user_id: string;
  role: Role;
  /** Missing before 20261115001500_named_roles.sql reaches a project. */
  named_role?: string | null;
  created_at: string;
  profiles: {
    full_name: string | null;
    avatar_path: string | null;
    address_form?: string | null;
  } | null;
};

/**
 * A business's active members, as the signed-in person may read them (RLS),
 * with the role the business named that each holds (members read it; the
 * roles plan's R11b). Before its migration reaches a project nobody holds
 * one, and the members are read as before. Page by page: nothing caps a
 * business's people, and a document to everyone is built from these.
 */
async function activeMembers(
  supabase: Client,
  businessId: string,
): Promise<MemberRow[]> {
  const named = await readAllPages((first, last) =>
    supabase
      .from("memberships")
      .select(
        "user_id, role, named_role, created_at, profiles (full_name, avatar_path, address_form)",
      )
      .eq("business_id", businessId)
      .eq("active", true)
      .order("user_id")
      .range(first, last),
  );
  if (!named.error) return named.data;
  if (!isMissingColumn(named.error)) throw named.error;
  return membersWithoutNamedRoles(supabase, businessId);
}

/**
 * The same, before memberships have a named role. Before
 * 20261109000400_profile_about.sql reaches a project there is no form of
 * address yet: the members are read as before, and the copy stays neutral.
 */
async function membersWithoutNamedRoles(
  supabase: Client,
  businessId: string,
): Promise<MemberRow[]> {
  const read = await readAllPages((first, last) =>
    supabase
      .from("memberships")
      .select(
        "user_id, role, created_at, profiles (full_name, avatar_path, address_form)",
      )
      .eq("business_id", businessId)
      .eq("active", true)
      .order("user_id")
      .range(first, last),
  );
  if (!read.error) return read.data;
  if (!isMissingColumn(read.error)) throw read.error;
  return allPages((first, last) =>
    supabase
      .from("memberships")
      .select("user_id, role, created_at, profiles (full_name, avatar_path)")
      .eq("business_id", businessId)
      .eq("active", true)
      .order("user_id")
      .range(first, last),
  );
}

/** A member's name in the business: its own for them, else theirs. */
const nameOf = (
  row: Pick<MemberRow, "user_id" | "profiles">,
  names: MemberNames,
) => nameIn(names, row.user_id, row.profiles?.full_name);

/** An invite nobody claimed, as the Team screen reads it. */
type InviteRow = {
  id: string;
  full_name: string | null;
  phone: string;
  role: Role;
  /** Missing before 20261115001600_named_roles_give.sql reaches a project. */
  named_role?: string | null;
  expires_at: string;
};

/**
 * The business's invites nobody claimed (open or expired), with the role
 * the business named that each gives (the roles plan's R11b); before its
 * migration none gives one. Page by page: expired ones are kept, and pile up
 * over the years.
 */
async function openInvites(
  supabase: Client,
  businessId: string,
): Promise<InviteRow[]> {
  const named = await readAllPages((first, last) =>
    supabase
      .from("invites")
      .select("id, full_name, phone, role, named_role, expires_at")
      .eq("business_id", businessId)
      .is("claimed_at", null)
      .order("id")
      .range(first, last),
  );
  if (!named.error) return named.data;
  if (!isMissingColumn(named.error)) throw named.error;
  return allPages((first, last) =>
    supabase
      .from("invites")
      .select("id, full_name, phone, role, expires_at")
      .eq("business_id", businessId)
      .is("claimed_at", null)
      .order("id")
      .range(first, last),
  );
}

/** A role the business named, live or archived, by its id. */
export type BusinessRoleNames = ReadonlyMap<
  string,
  NamedRole & { archived: boolean }
>;

const BusinessRoleRow = z.object({
  id: z.uuid(),
  base: z.enum(BASE_ROLES),
  name: z.string(),
  name_en: z.string().nullable(),
  archived_at: z.string().nullable(),
});

/**
 * Every role the business named, archived ones too (an expired invite may
 * name one), as its members and views read them (RLS: a colleague's role is
 * no secret), or with the secret key for the console ("מי רואה שכר",
 * `@db/payroll`). None before 20261115001500_named_roles.sql reaches a
 * project.
 */
export async function businessRoleNames(
  supabase: SupabaseClient<Database>,
  businessId: string,
): Promise<BusinessRoleNames> {
  const { data, error } = await supabase
    .from("business_roles")
    .select("id, base, name, name_en, archived_at")
    .eq("business_id", businessId);
  // PostgREST's and Postgres's "no such table".
  if (error?.code === "PGRST205" || error?.code === "42P01") return new Map();
  if (error) throw error;
  return new Map(
    z
      .array(BusinessRoleRow)
      .parse(data)
      .map((row) => [
        row.id,
        {
          id: row.id,
          base: row.base,
          name: row.name,
          nameEn: row.name_en,
          archived: row.archived_at !== null,
        },
      ]),
  );
}

/**
 * One role the business named, by its id, as its members read it (RLS: a
 * colleague's role is no secret): its names and its base. Null for none,
 * for one not of the business, and before 20261115001500_named_roles.sql
 * reaches a project. For a single person's role, where reading all of the
 * business's (`businessRoleNames`) would be more than needed.
 */
export async function namedRoleIn(
  supabase: Client,
  businessId: string,
  id: string | null | undefined,
): Promise<NamedRole | null> {
  if (!id) return null;
  const { data, error } = await supabase
    .from("business_roles")
    .select("id, base, name, name_en, archived_at")
    .eq("business_id", businessId)
    .eq("id", id)
    .maybeSingle();
  // PostgREST's and Postgres's "no such table".
  if (error?.code === "PGRST205" || error?.code === "42P01") return null;
  if (error) throw error;
  if (!data) return null;
  const row = BusinessRoleRow.parse(data);
  return { id: row.id, base: row.base, name: row.name, nameEn: row.name_en };
}

/** The named role a row holds or gives, by `roles`; null for none (or one unknown). */
function namedOf(
  roles: BusinessRoleNames,
  id: string | null | undefined,
): (NamedRole & { archived: boolean }) | null {
  return id ? (roles.get(id) ?? null) : null;
}

/**
 * The people of a business for its Team screen: active members with their
 * profile, and invites nobody has claimed yet (open or expired), each with
 * the role the business named that they hold or it gives (R11b). Read as
 * the signed-in person under RLS, so only someone who sees the team
 * (team.view, the roles plan's R6) gets the invites and the numbers
 * (`public.team_phones`; members read each other's names only); callers
 * check `canSeeTeam` first. Each member by the business's name for them
 * (`memberNames`); an invite by the name it was sent with.
 */
export async function getTeam(
  businessId: string,
): Promise<{ members: TeamMember[]; invites: TeamInvite[] }> {
  const supabase = await createClient();
  const [members, phoneOf, invites, roles, names] = await Promise.all([
    activeMembers(supabase, businessId),
    teamPhones(supabase, businessId),
    openInvites(supabase, businessId),
    businessRoleNames(supabase, businessId),
    memberNames(supabase, businessId),
  ]);
  return {
    members: members.map((row) => ({
      userId: row.user_id,
      name: nameOf(row, names),
      phone: phoneOf.get(row.user_id) ?? null,
      role: row.role,
      namedRole: namedOf(roles, row.named_role),
      photo: profilePhotoSrc(row.profiles?.avatar_path),
      addressForm: addressFormOf(row.profiles?.address_form),
    })),
    invites: invites.map((row) => ({
      id: row.id,
      name: row.full_name?.trim() || null,
      phone: row.phone,
      role: row.role,
      namedRole: namedOf(roles, row.named_role),
      expiresAt: row.expires_at,
    })),
  };
}

/** The business's numbers by person, for whoever sees the team (none for others). */
async function teamPhones(
  supabase: Client,
  businessId: string,
): Promise<Map<string, string | null>> {
  // One row a person on the staff: page by page, as the table reads.
  const phones = await readAllPages((first, last) =>
    supabase
      .rpc("team_phones", { business: businessId })
      .order("user_id")
      .range(first, last),
  );
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
  const data = await allPages((first, last) =>
    supabase
      .from("memberships")
      .select("user_id, profiles (phone)")
      .eq("business_id", businessId)
      .eq("active", true)
      .order("user_id")
      .range(first, last),
  );
  return data.map((row) => [row.user_id, row.profiles?.phone ?? null]);
}

/** One member as their profile shows them to whoever sees the team. */
export type TeamPerson = TeamMember & {
  /** Their line about themselves, or null. */
  bio: string | null;
  cover: CoverPreset;
  /** When they joined the business (ISO). */
  since: string;
};

/**
 * One active member of the business with their profile, as whoever sees the
 * team reads them (RLS; callers check `canSeeTeam` first), with the role
 * the business named that they hold (R11b). Null when they are not an
 * active member. Before the profile's H2 migration reaches a project, they
 * have no line and the default cover. By the business's name for them.
 */
export async function getTeamPerson(
  businessId: string,
  personId: string,
): Promise<TeamPerson | null> {
  const supabase = await createClient();
  const [row, phoneOf, roles, names] = await Promise.all([
    teamPersonRow(supabase, businessId, personId),
    teamPhones(supabase, businessId),
    businessRoleNames(supabase, businessId),
    memberNames(supabase, businessId, [personId]),
  ]);
  if (!row) return null;
  return {
    userId: row.user_id,
    name: nameOf(row, names),
    phone: phoneOf.get(row.user_id) ?? null,
    role: row.role,
    namedRole: namedOf(roles, row.named_role),
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
  // With the role the business named that they hold, once memberships have
  // one (20261115001500_named_roles.sql); else as before.
  const named = await supabase
    .from("memberships")
    .select(
      "user_id, role, named_role, created_at, profiles (full_name, avatar_path, bio, cover, address_form)",
    )
    .eq("business_id", businessId)
    .eq("user_id", personId)
    .eq("active", true)
    .maybeSingle();
  if (!named.error) return named.data;
  if (!isMissingColumn(named.error)) throw named.error;
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
  /** Their role: someone off the staff (an accountant) takes no shift or list. */
  role: Role;
  /**
   * The id of the role the business named that they hold (R11b), built on
   * `role`, else null: a list to it is theirs (R11d). Null for everyone
   * before 20261115001500_named_roles.sql reaches a project.
   */
  namedRole: string | null;
  /** An image src for their photo (`profilePhotoSrc`), or null. */
  photo: string | null;
  /** How the app writes about them (ICU `select`), or null until they choose. */
  addressForm: AddressForm | null;
};

/**
 * The names, photos and forms of address of a business's active members, as
 * anyone in it may read them (RLS): for the published schedule, which every
 * member reads. With each one's role and the role the business named that
 * they hold (members read both), so the lists' send screen counts who holds
 * each. Each by the business's name for them.
 */
export async function getColleagues(businessId: string): Promise<Colleague[]> {
  const supabase = await createClient();
  const [members, names] = await Promise.all([
    activeMembers(supabase, businessId),
    memberNames(supabase, businessId),
  ]);
  return members.map((row) => ({
    userId: row.user_id,
    name: nameOf(row, names),
    role: row.role,
    namedRole: row.named_role ?? null,
    photo: profilePhotoSrc(row.profiles?.avatar_path),
    addressForm: addressFormOf(row.profiles?.address_form),
  }));
}

// ---------------------------------------------------------------------------
// Team changes (Orel, 14 November 2026; 20261114000100_team_changes.sql)

/**
 * Why a team change was not made: the database's refusal as the screens
 * explain it (`teamChangeFailureOf`), or `notYet` before the migration
 * reaches the project, when the screens offer none of it.
 */
export type TeamChangeError = TeamChangeFailure | "notYet";

type DatabaseError = {
  code?: string;
  hint?: string | null;
  message: string;
};

function teamChangeError(error: DatabaseError): TeamChangeError {
  if (isMissingFunction(error)) return "notYet";
  const failure = teamChangeFailureOf(error.code, error.hint);
  if (failure === "failed") {
    throw new Error(`Could not change the team: ${error.message}`);
  }
  return failure;
}

const LeftCountsRow = z.object({
  shifts: z.int().min(0),
  drafts: z.int().min(0),
  swaps: z.int().min(0),
  reopened: z.int().min(0),
});

/**
 * `actorId`, who edits the business's team, takes `personId` off its
 * team (`public.remove_member`): their membership stays, inactive, and so
 * does their history; their shifts still to start, in published weeks and
 * drafts, come off them and show as missing; the swaps they asked for on
 * those shifts are cancelled, and a colleague's they took, still waiting for
 * approval, is open again for someone else (`reopened`); they leave their
 * departments and open lists. The schedule's other builders are told how
 * many shifts lack someone (`schedule.unfilled`), and the asker of a swap
 * open again that it is (`swap.reopened`), so callers call `pushSoon()`
 * after. The person is told nothing.
 *
 * Runs with the secret key: callers check the viewer may act on the person
 * (`canRemoveMember`) and is not viewing as someone else (`canWrite`); the
 * database checks again. Refused: `notAllowed` (not theirs to remove),
 * `gone` (no longer on the team), `yourself`, `lastOwner`, `demo`,
 * `clockedIn` (clock them out first). Any other error throws.
 */
export async function removeMember(
  actorId: string,
  businessId: string,
  personId: string,
): Promise<
  { ok: true; left: LeftCounts } | { ok: false; error: TeamChangeError }
> {
  const { data, error } = await createAdminClient().rpc("remove_member", {
    actor: actorId,
    business: businessId,
    person: personId,
  });
  if (error) return { ok: false, error: teamChangeError(error) };
  return { ok: true, left: LeftCountsRow.parse(data) };
}

/**
 * `actorId` gives `personId` the role `to` (`public.set_member_role`): a
 * built-in role, or one the business named on its base (the roles plan's
 * R11b), by the rule of inviting: both their role now and the new one must
 * be roles the actor invites to (`mayChangeRole`, `roleChoices`). `seen` is
 * the role and named role the screen showed, for an undo: `changed` when
 * either moved meanwhile. The same role and named role write nothing
 * (`changed: false`). Becoming an accountant takes them off the staff as
 * removing does (`left` counts what came off, and the builders are told:
 * `pushSoon()` after); becoming an owner or an accountant clears their
 * personal permissions; between manager and worker they stay. Refused as
 * `removeMember` is, `elsewhere` for an accountant on another business's
 * staff joining this one's (#80: say it neutrally), and `roleGone` for a
 * named role removed meanwhile.
 */
export async function setMemberRole(
  actorId: string,
  businessId: string,
  personId: string,
  to: RoleChoice,
  seen?: RoleChoice,
): Promise<
  | { ok: true; changed: boolean; left: LeftCounts }
  | { ok: false; error: TeamChangeError }
> {
  const { data, error } = await createAdminClient().rpc("set_member_role", {
    actor: actorId,
    business: businessId,
    person: personId,
    new_role: to.role,
    // The named arguments only when there is one: a project before their
    // migration takes the rest, and none given means none seen.
    ...(to.namedRole ? { new_named: to.namedRole } : {}),
    ...(seen ? { seen_role: seen.role } : {}),
    ...(seen?.namedRole ? { seen_named: seen.namedRole } : {}),
  });
  if (error) return { ok: false, error: teamChangeError(error) };
  const row = LeftCountsRow.extend({ changed: z.boolean() }).parse(data);
  return {
    ok: true,
    changed: row.changed,
    left: {
      shifts: row.shifts,
      drafts: row.drafts,
      swaps: row.swaps,
      reopened: row.reopened,
    },
  };
}

const NameChangeRow = z.object({
  changed: z.boolean(),
  name: z.string().nullable(),
});

/**
 * `actorId` fixes the name the business shows for `personId`
 * (`public.set_member_name`, ROADMAP "תיקון שם"): its own for them, in this
 * business only and everywhere in it, by the rule of changing a role
 * (`canRemoveMember`); their own name is never touched. `to` null, or their
 * own name, keeps none of the business's own, so it shows theirs again (the
 * undo of a first fix). `seen` is the name the screen showed (null: none),
 * so one changed meanwhile stays (`changed`). The same name writes nothing
 * (`changed: false`). `name` is the one shown after it. Logged without a
 * name; the person is told nothing.
 *
 * Runs with the secret key: callers check the viewer may act on the person
 * and is not viewing as someone else (`canWrite`), and send a name
 * `parseTeamName` kept; the database checks again. Refused as
 * `setMemberRole` is (`notAllowed`, `gone`, `yourself`, `demo`, `changed`),
 * and `badName` for a name it can't keep. Any other error throws.
 */
export async function setMemberName(
  actorId: string,
  businessId: string,
  personId: string,
  to: string | null,
  seen: string | null,
): Promise<
  | { ok: true; changed: boolean; name: string | null }
  | { ok: false; error: TeamChangeError }
> {
  const { data, error } = await createAdminClient().rpc("set_member_name", {
    actor: actorId,
    business: businessId,
    person: personId,
    // None given is none: no name of the business's own, none seen.
    ...(to !== null ? { new_name: to } : {}),
    ...(seen !== null ? { seen_name: seen } : {}),
  });
  if (error) return { ok: false, error: teamChangeError(error) };
  const row = NameChangeRow.parse(data);
  return { ok: true, changed: row.changed, name: row.name };
}

/**
 * `actorId` cancels an invite nobody claimed, open or expired
 * (`public.team_invite_cancel`), by the rule of sending its link
 * (`canCancelInvite`). Its link stops working at once, the number may be
 * invited again, and the row stays for the activity log. `gone` when it was
 * claimed or cancelled meanwhile, `notAllowed` when not theirs.
 */
export async function cancelTeamInvite(
  actorId: string,
  inviteId: string,
): Promise<{ ok: true } | { ok: false; error: TeamChangeError }> {
  const { error } = await createAdminClient().rpc("team_invite_cancel", {
    actor: actorId,
    invite: inviteId,
  });
  if (error) return { ok: false, error: teamChangeError(error) };
  return { ok: true };
}

/** A business the signed-in person was taken off the team of. */
export type Departure = {
  businessId: string;
  name: string;
  accent: string;
  /** ISO. */
  leftAt: string;
};

const DepartureRow = z.object({
  business: z.uuid(),
  name: z.string(),
  accent: z.string(),
  left_at: z.string(),
});

/**
 * The businesses the signed-in person was taken off the team of, the latest
 * first (`public.own_departures`, under their own session): what the app says
 * next time they open it ("no longer on the team of …", Orel's decision 3;
 * `departureToTell` picks which). Under the policies they read
 * nothing else of those businesses. None before the migration reaches the
 * project, when nobody was removed.
 */
export async function ownDepartures(): Promise<Departure[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("own_departures");
  if (error) {
    if (isMissingFunction(error)) return [];
    throw error;
  }
  return z
    .array(DepartureRow)
    .parse(data)
    .map((row) => ({
      businessId: row.business,
      name: row.name,
      accent: row.accent,
      leftAt: row.left_at,
    }));
}

/**
 * How many of a member's shifts have not started yet, in published weeks and
 * in drafts (`countShiftsAhead`), as the viewer reads them (RLS: drafts for
 * whoever builds the schedule): what taking them off the staff would take
 * off them, for the hint before the action; the database counts again.
 * `timeZone` is the business's.
 */
export async function shiftsAhead(
  businessId: string,
  personId: string,
  timeZone: string,
  now: Date = new Date(),
): Promise<Pick<LeftCounts, "shifts" | "drafts">> {
  const supabase = await createClient();
  const { data, error } = await supabase
    // bounded: one person's shifts still to come, at most 200 shifts a week
    // (raising that cap must page this).
    .from("schedule_shifts")
    .select(
      "day, starts_at, shift_assignments!inner (user_id), schedule_weeks!inner (schedule_published_at)",
    )
    .eq("business_id", businessId)
    .eq("shift_assignments.user_id", personId)
    // A shift of an earlier day has started, whatever its hour.
    .gte("day", dateIn(now, timeZone));
  if (error) throw error;
  return countShiftsAhead(
    data.map((row) => ({
      day: row.day,
      start: row.starts_at.slice(0, 5),
      published: row.schedule_weeks.schedule_published_at !== null,
    })),
    timeZone,
    now,
  );
}

/**
 * Whether a member has an entry open on the clock in the business now, as
 * whoever reads the business's hours reads it (RLS: the clock's editors and
 * pay holders). Taking them off the team or the staff is refused until they
 * clock out (`clockedIn`): after it they could not. The person's page asks it
 * only of someone who reads the hours; anyone else learns it from the
 * refusal.
 */
export async function isClockedIn(
  businessId: string,
  personId: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("time_entries")
    .select("id")
    .eq("business_id", businessId)
    .eq("user_id", personId)
    .is("clock_out", null)
    .limit(1);
  if (error) throw error;
  return data.length > 0;
}

/** Someone who was on the team and is no longer, as their colleagues know. */
export type FormerMember = {
  userId: string;
  /**
   * Null for most: a colleague's profile is read only while both are on the
   * team; whoever sees pay still reads it, for the hours they keep paying.
   */
  name: string | null;
  /** The role they had. */
  role: Role;
  /**
   * The role the business named that they had, built on `role` (the roles
   * plan's R11b), while the business keeps it; null for none.
   */
  namedRole: NamedRole | null;
};

const FormerRow = z.object({
  user_id: z.string(),
  role: z.enum(ROLES),
  named_role: z.uuid().nullable().optional(),
  profiles: z.object({ full_name: z.string().nullable() }).nullable(),
});

/**
 * A member of the business who is no longer on its team (their membership
 * kept, inactive), as a member reads it (RLS: the business's
 * memberships), with the role the business named that they left in (R11b);
 * null for someone active, or never in it. For the person's page once they
 * were taken off: it says so instead of "not found". Before
 * 20261115001500_named_roles.sql reaches a project, none was named. By the
 * business's name for them, which only the same pay holders still read.
 */
export async function getFormerMember(
  businessId: string,
  personId: string,
): Promise<FormerMember | null> {
  const supabase = await createClient();
  const read = (named: boolean) =>
    supabase
      .from("memberships")
      .select(
        named
          ? "user_id, role, named_role, profiles (full_name)"
          : "user_id, role, profiles (full_name)",
      )
      .eq("business_id", businessId)
      .eq("user_id", personId)
      .eq("active", false)
      .maybeSingle();
  const [first, names] = await Promise.all([
    read(true),
    memberNames(supabase, businessId, [personId]),
  ]);
  let { data, error } = first;
  if (isMissingColumn(error)) ({ data, error } = await read(false));
  if (error) throw error;
  if (!data) return null;
  const row = FormerRow.parse(data);
  return {
    userId: row.user_id,
    name: nameIn(names, row.user_id, row.profiles?.full_name),
    role: row.role,
    namedRole: await namedRoleIn(supabase, businessId, row.named_role),
  };
}
