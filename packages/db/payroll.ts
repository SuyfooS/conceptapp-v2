import "server-only";
import { isStaff, ROLES, type Role } from "@domain/modules";
import type { OriginalTimes } from "@domain/pay-month";
import { PAY_PERMISSION, type PayRole } from "@domain/payroll-access";
import { type AddressForm, addressFormOf } from "@domain/profile";
import { profilePhotoSrc } from "@domain/profile-photos";
import type { NamedRole } from "@domain/role-access";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "./database.types";
import { memberNames, nameIn } from "./member-names";
import { isMissingColumn, isMissingFunction } from "./missing";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";
import { businessRoleNames } from "./team";

/*
 * Pay access and the pay screens (payroll P3). Reads run under the person's own
 * session, so RLS decides what they get: hours and names of everyone who worked
 * in the business for whoever holds clock.payroll (20261110000300_payroll_access.sql).
 * Grants are written with the secret key for `actor`, whom the database checks
 * is an owner or on the ConceptApp team; callers make sure the actor is the
 * signed-in person and not viewing as someone else. The console reads the
 * same with the secret key (`getPayAccessForTeam`), behind its own check.
 */

/** Someone who is or was on the staff, for the month's hours. */
export type PayPerson = {
  userId: string;
  name: string | null;
  photo: string | null;
  addressForm: AddressForm | null;
  role: Role;
  /** Still in the business; one who left still has hours to pay. */
  active: boolean;
};

type PersonRow = {
  user_id: string;
  role: Role;
  active: boolean;
  profiles: {
    full_name: string | null;
    avatar_path: string | null;
    address_form?: string | null;
  } | null;
};

/**
 * Everyone who was ever a member of the business, active or not, with their
 * name, photo and form of address, as the signed-in person may read them,
 * each by the business's name for them. Callers keep the staff and those
 * with hours (`isStaff`): someone who worked here before becoming an
 * accountant still has hours to pay.
 */
export async function getPayPeople(businessId: string): Promise<PayPerson[]> {
  const supabase = await createClient();
  const [read, names] = await Promise.all([
    supabase
      .from("memberships")
      .select(
        "user_id, role, active, profiles (full_name, avatar_path, address_form)",
      )
      .eq("business_id", businessId),
    memberNames(supabase, businessId),
  ]);
  let rows: PersonRow[];
  if (!read.error) {
    rows = read.data;
  } else {
    // Before the profile's H2 migration there is no form of address yet.
    if (!isMissingColumn(read.error)) throw read.error;
    const older = await supabase
      .from("memberships")
      .select("user_id, role, active, profiles (full_name, avatar_path)")
      .eq("business_id", businessId);
    if (older.error) throw older.error;
    rows = older.data;
  }
  return rows.map((row) => ({
    userId: row.user_id,
    name: nameIn(names, row.user_id, row.profiles?.full_name),
    photo: profilePhotoSrc(row.profiles?.avatar_path),
    addressForm: addressFormOf(row.profiles?.address_form),
    role: row.role,
    active: row.active,
  }));
}

export type PayViewKind = "month" | "person" | "access";

/**
 * The signed-in person opened a pay screen: logged once a day (`payroll.view`)
 * when they hold clock.payroll or view as an accountant, and nothing for
 * anyone else. With their own session, after the page is on screen: never
 * while a page renders, which a prefetch would do too. Before its migration
 * reaches a project, nothing is noted.
 */
export async function notePayrollAccess(
  businessId: string,
  month: string,
  kind: PayViewKind,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("note_payroll_access", {
    business: businessId,
    pay_month: `${month}-01`,
    view_kind: kind,
  });
  if (error && !isMissingFunction(error)) throw error;
}

/** What a month's file for payroll holds, as the log keeps it (payroll P8). */
export type PayrollExportNote = {
  month: string;
  people: number;
  shifts: number;
  engineVersion: string;
};

/**
 * The signed-in person takes a month's file for payroll: logged as
 * `payroll.export` with their own session, before the file goes out. The
 * database refuses anyone who doesn't hold clock.payroll or view as an
 * accountant (42501). Throws when the row isn't written, the function missing
 * included, so no file goes out without its row.
 */
export async function notePayrollExport(
  businessId: string,
  note: PayrollExportNote,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("note_payroll_export", {
    business: businessId,
    pay_month: `${note.month}-01`,
    person_count: note.people,
    shift_count: note.shifts,
    engine_version: note.engineVersion,
  });
  if (error) throw error;
}

/**
 * When the month's newest file for payroll was taken, by anyone, as the
 * signed-in person may read the log (pay holders read pay rows); null when
 * none was taken.
 */
export async function getLastPayrollExport(
  businessId: string,
  month: string,
): Promise<{ at: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("created_at")
    .eq("business_id", businessId)
    .eq("action", "payroll.export")
    .eq("details->>month", month)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const [row] = data;
  return row ? { at: row.created_at } : null;
}

/**
 * The roles the business gives pay access to (`public.role_permissions`), as
 * the signed-in person may read them: its owners, and the team viewing it as
 * its owner (20261115000800_roles_setter.sql), as /manage/access is open to.
 */
export async function getPayRoles(businessId: string): Promise<PayRole[]> {
  return readPayRoles(await createClient(), businessId);
}

/**
 * The same, read with the secret key: for the console, whose people aren't
 * members of the business, and for the team screens of someone who edits the
 * team without being an owner, to offer none of the roles only an owner
 * gives (`currentOwnerOnlyRoles`, the roles plan's R6). Callers check first
 * that the person is on the ConceptApp team, or edits the business's team.
 */
export async function getPayRolesForTeam(
  businessId: string,
): Promise<PayRole[]> {
  return readPayRoles(createAdminClient(), businessId);
}

/**
 * Only the rows that give it (`allowed`): a row may deny a key since the
 * roles plan's R1 (20261115000700_roles_catalogue.sql). Nothing writes a
 * denial for pay, whose rows are added and removed, but one must never read
 * as pay on. Before that migration there is no column, and every row gives.
 */
async function readPayRoles(
  supabase: SupabaseClient<Database>,
  businessId: string,
): Promise<PayRole[]> {
  const rows = (allowedOnly: boolean) => {
    const query = supabase
      .from("role_permissions")
      .select("role")
      .eq("business_id", businessId)
      .eq("perm", PAY_PERMISSION);
    return allowedOnly ? query.eq("allowed", true) : query;
  };
  let { data, error } = await rows(true);
  if (isMissingColumn(error)) ({ data, error } = await rows(false));
  if (error) {
    // Before 20261110000300_payroll_access.sql: no role has it.
    if (error.code === "PGRST205" || error.code === "42P01") return [];
    throw error;
  }
  return (data ?? []).flatMap((row) =>
    row.role === "manager" || row.role === "worker" ? [row.role] : [],
  );
}

/** Someone active in the business, as the access screen lists them. */
export type AccessPerson = {
  userId: string;
  name: string | null;
  photo: string | null;
  role: Role;
  /**
   * The role the business named that they hold (the roles plan's R11b), by
   * its names; null for none. It never gives pay (`coveredByRole`).
   */
  namedRole: Pick<NamedRole, "id" | "name" | "nameEn"> | null;
  /** Given pay access to them alone. */
  personal: boolean;
};

/**
 * The business's active members, each with whether they were given pay access
 * personally (`memberships.perms`) and the role the business named that they
 * hold, for the access screen.
 */
export async function getAccessPeople(
  businessId: string,
): Promise<AccessPerson[]> {
  return readAccessPeople(await createClient(), businessId);
}

/** An active membership as the access screen reads it. */
const AccessRow = z.object({
  user_id: z.string(),
  role: z.enum(ROLES),
  /** Missing before 20261115001500_named_roles.sql reaches a project. */
  named_role: z.uuid().nullable().optional(),
  perms: z.array(z.string()),
  profiles: z
    .object({
      full_name: z.string().nullable(),
      avatar_path: z.string().nullable(),
    })
    .nullable(),
});

/**
 * Read with `supabase`: the owner's session, whose members' rows and the
 * business's roles RLS shows them (members and views read
 * `public.business_roles`), or the secret key for the console. The named
 * role's names come as the team screens read them (`businessRoleNames`),
 * and each person by the business's name for them (`memberNames`). Before
 * 20261115001500_named_roles.sql nobody holds one, and the people are read
 * as before.
 */
async function readAccessPeople(
  supabase: SupabaseClient<Database>,
  businessId: string,
): Promise<AccessPerson[]> {
  const people = (named: boolean) =>
    supabase
      .from("memberships")
      .select(
        named
          ? "user_id, role, named_role, perms, profiles (full_name, avatar_path)"
          : "user_id, role, perms, profiles (full_name, avatar_path)",
      )
      .eq("business_id", businessId)
      .eq("active", true);
  const [read, roles, names] = await Promise.all([
    people(true),
    businessRoleNames(supabase, businessId),
    memberNames(supabase, businessId),
  ]);
  let { data, error } = read;
  if (isMissingColumn(error)) ({ data, error } = await people(false));
  if (error) throw error;
  return z
    .array(AccessRow)
    .parse(data ?? [])
    .map((row) => {
      const named = row.named_role ? roles.get(row.named_role) : undefined;
      return {
        userId: row.user_id,
        name: nameIn(names, row.user_id, row.profiles?.full_name),
        photo: profilePhotoSrc(row.profiles?.avatar_path),
        role: row.role,
        namedRole: named
          ? { id: named.id, name: named.name, nameEn: named.nameEn }
          : null,
        personal: isStaff(row.role) && row.perms.includes(PAY_PERMISSION),
      };
    });
}

/**
 * Who sees pay in a business, for the console's "מי רואה שכר": the roles
 * given it and the business's active members, each with their personal
 * access. Read with the secret key: the team isn't a member, so RLS has
 * nothing to show it, and no policy is widened for it. Callers check that
 * the person is on the team first (`consolePayAccess`). Without photos: the
 * team reads no one's photo (Storage lets people read only their own and
 * their colleagues'), so each is drawn by initials, as the console's list of
 * the business's people is.
 */
export async function getPayAccessForTeam(
  businessId: string,
): Promise<{ roles: PayRole[]; people: AccessPerson[] }> {
  const admin = createAdminClient();
  const [roles, people] = await Promise.all([
    readPayRoles(admin, businessId),
    readAccessPeople(admin, businessId),
  ]);
  return {
    roles,
    people: people.map((person) => ({ ...person, photo: null })),
  };
}

export type GrantFailure = "noAccess" | "notInTeam" | "always" | "failed";

export type GrantResult = { ok: true } | { ok: false; failure: GrantFailure };

function grantFailure(error: { code?: string; message: string }): GrantResult {
  switch (error.code) {
    case "42501":
      return { ok: false, failure: "noAccess" };
    case "P0002":
      return { ok: false, failure: "notInTeam" };
    case "22023":
      return { ok: false, failure: "always" };
    default:
      console.error("changing pay access failed", error.message);
      return { ok: false, failure: "failed" };
  }
}

/** `actor` gives pay access to everyone in a role of the business, or takes it back. */
export async function setRolePayAccess(
  actorId: string,
  businessId: string,
  role: PayRole,
  granted: boolean,
): Promise<GrantResult> {
  const { error } = await createAdminClient().rpc("set_role_permission", {
    actor: actorId,
    business: businessId,
    grant_role: role,
    perm_key: PAY_PERMISSION,
    granted,
  });
  return error ? grantFailure(error) : { ok: true };
}

/** `actor` gives pay access to one person on the staff, or takes it back. */
export async function setPersonalPayAccess(
  actorId: string,
  businessId: string,
  personId: string,
  granted: boolean,
): Promise<GrantResult> {
  const { error } = await createAdminClient().rpc("set_member_permission", {
    actor: actorId,
    business: businessId,
    person: personId,
    perm_key: PAY_PERMISSION,
    granted,
  });
  return error ? grantFailure(error) : { ok: true };
}

/**
 * The times corrected entries had before each correction, from the log's
 * clock.correct rows, as the signed-in person may read them (pay holders and
 * managers read the clock's rows). Rows it can't read are left out.
 */
export async function getCorrections(
  businessId: string,
  entryIds: readonly string[],
): Promise<{ entryId: string; at: string; from: OriginalTimes }[]> {
  if (entryIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("details, created_at")
    .eq("business_id", businessId)
    .eq("action", "clock.correct")
    .in("details->>entry", [...entryIds]);
  if (error) throw error;
  return data.flatMap((row) => {
    const details = row.details as {
      entry?: unknown;
      from?: { clock_in?: unknown; clock_out?: unknown };
    } | null;
    const entryId = details?.entry;
    const clockIn = details?.from?.clock_in;
    const clockOut = details?.from?.clock_out ?? null;
    return typeof entryId === "string" &&
      typeof clockIn === "string" &&
      (clockOut === null || typeof clockOut === "string")
      ? [{ entryId, at: row.created_at, from: { clockIn, clockOut } }]
      : [];
  });
}
