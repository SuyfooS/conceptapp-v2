import "server-only";
import { dateIn } from "@domain/availability";
import type { Role } from "@domain/modules";
import {
  type AddressForm,
  addressFormOf,
  type CoverPreset,
  coverOf,
} from "@domain/profile";
import { profilePhotoSrc } from "@domain/profile-photos";
import {
  countShiftsAhead,
  type LeftCounts,
  type TeamChangeFailure,
  type TeamInvite,
  type TeamMember,
  teamChangeFailureOf,
} from "@domain/team";
import { z } from "zod";
import { isMissingColumn, isMissingFunction } from "./missing";
import { createAdminClient } from "./supabase/admin";
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
 * the signed-in person under RLS, so only someone who sees the team
 * (team.view, the roles plan's R6) gets the invites and the numbers
 * (`public.team_phones`; members read each other's names only); callers
 * check `canSeeTeam` first.
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

/** The business's numbers by person, for whoever sees the team (none for others). */
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
 * team reads them (RLS; callers check `canSeeTeam` first). Null when they
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
  /** Their role: someone off the staff (an accountant) takes no shift or list. */
  role: Role;
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
    role: row.role,
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
 * `actorId` gives `personId` the role `role` (`public.set_member_role`), by
 * the rule of inviting: both their role now and the new one must be roles
 * the actor invites to (`mayChangeRole`, `roleChoices`). `seenRole` is the
 * role the screen showed, for an undo: `changed` when it moved meanwhile.
 * The same role writes nothing (`changed: false`). Becoming an accountant
 * takes them off the staff as removing does (`left` counts what came off,
 * and the builders are told: `pushSoon()` after); becoming an owner or an
 * accountant clears their personal permissions; between manager and worker
 * they stay. Refused as `removeMember` is, and `elsewhere` for an accountant
 * on another business's staff joining this one's (#80: say it neutrally).
 */
export async function setMemberRole(
  actorId: string,
  businessId: string,
  personId: string,
  role: Role,
  seenRole?: Role,
): Promise<
  | { ok: true; changed: boolean; left: LeftCounts }
  | { ok: false; error: TeamChangeError }
> {
  const { data, error } = await createAdminClient().rpc("set_member_role", {
    actor: actorId,
    business: businessId,
    person: personId,
    new_role: role,
    ...(seenRole ? { seen_role: seenRole } : {}),
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
};

/**
 * A member of the business who is no longer on its team (their membership
 * kept, inactive), as a member reads it (RLS: the business's
 * memberships); null for someone active, or never in it. For the person's
 * page once they were taken off: it says so instead of "not found".
 */
export async function getFormerMember(
  businessId: string,
  personId: string,
): Promise<FormerMember | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("user_id, role, profiles (full_name)")
    .eq("business_id", businessId)
    .eq("user_id", personId)
    .eq("active", false)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    userId: data.user_id,
    name: data.profiles?.full_name?.trim() || null,
    role: data.role,
  };
}
