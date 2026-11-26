import "server-only";
import { isUuid } from "@domain/activity";
import { ROLES } from "@domain/modules";
import {
  type ImportPerson,
  type KnownInvite,
  type KnownTeam,
  knownTeamOf,
  peopleImportRows,
} from "@domain/people-import";
import { z } from "zod";
import { memberNames, nameIn } from "./member-names";
import { isMissingFunction } from "./missing";
import { allPages } from "./pages";
import { createAdminClient } from "./supabase/admin";

/*
 * Inviting from a list ("הזמנה מרשימה", 20261128000300_people_import.sql):
 * the people a pasted list holds become invites all at once, or none, with
 * no link yet (`invites.link_pending`); their links are made one person at a
 * time from /team. Nothing is sent to anyone. Everything here runs with the
 * secret key: callers check who may act first (team.edit on the Team screen,
 * `staff.invite` in the console), and the database checks again, under a
 * lock on the business, what each row may be.
 */

/** What the database did with one row it was sent. */
export const PEOPLE_IMPORT_STATUSES = [
  "created",
  "updated",
  "same",
  "member",
  /** An invite with its link, or one with none the giver may not change. */
  "invited",
  "expired",
  /** An owner's or an accountant's invite, never changed by a list. */
  "kept",
] as const;
export type PeopleImportStatus = (typeof PEOPLE_IMPORT_STATUSES)[number];

/** One row of the answer: its place among the rows sent, from 1. */
export type PeopleImportRow = {
  i: number;
  status: PeopleImportStatus;
  /** The invite it is now, or was left as; null for a member's number. */
  invite: string | null;
};

/** Why nothing was written. Each refusal writes nothing at all. */
export type PeopleImportDbFailure =
  /** A demo business closed to invites (55000). */
  | "demo"
  /** A role the giver doesn't give, by rank or what it holds (42501). */
  | "notAllowed"
  /** A role that sees pay, which only an owner gives (42501, `pay`). */
  | "givesPay"
  /** A role the business named was removed meanwhile (22023, `archived`). */
  | "roleGone"
  /** The rows aren't as a screen reads a list, or the business is gone. */
  | "changed"
  /** Past 300 people (54000, `limit`). */
  | "tooMany"
  /** The project doesn't have the import yet. */
  | "failed";

export type PeopleImportDbResult =
  | { ok: true; importId: string | null; rows: PeopleImportRow[] }
  | { ok: false; failure: PeopleImportDbFailure }
  /** Past 500 invites waiting (54000, `open`): how many wait already. */
  | { ok: false; failure: "tooManyOpen"; open: number | null }
  /**
   * The console's only: numbers on another business's staff (23505,
   * `elsewhere`), by their rows' places among those sent, from 1.
   */
  | { ok: false; failure: "elsewhere"; rows: number[] };

export type PeopleUndoDbResult =
  | {
      ok: true;
      /** The import's invites cancelled: those still with no link. */
      cancelled: number;
      /** Those kept: a link was made for them, or they were claimed. */
      kept: number;
    }
  | { ok: false; failure: "notAllowed" | "changed" | "failed" };

/** The rows' places in a refusal's detail ("2,7"), each a place from 1. */
function placesOf(detail: string | null | undefined): number[] {
  return (detail ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => /^[1-9]\d{0,3}$/.test(part))
    .map(Number);
}

/**
 * The database's refusals of an import, as the screens explain them; null
 * for one no screen explains, which the caller throws.
 */
export function peopleImportError(
  code: string | undefined,
  hint?: string | null,
  detail?: string | null,
): Exclude<PeopleImportDbResult, { ok: true }> | null {
  switch (code) {
    case "42501":
      return {
        ok: false,
        failure: hint === "pay" ? "givesPay" : "notAllowed",
      };
    case "55000":
      return { ok: false, failure: "demo" };
    case "54000":
      if (hint === "limit") return { ok: false, failure: "tooMany" };
      if (hint === "open") {
        return {
          ok: false,
          failure: "tooManyOpen",
          open: /^\d{1,9}$/.test(detail ?? "") ? Number(detail) : null,
        };
      }
      return null;
    case "22023":
      return {
        ok: false,
        failure: hint === "archived" ? "roleGone" : "changed",
      };
    case "P0002":
      return { ok: false, failure: "changed" };
    case "23505":
      return hint === "elsewhere"
        ? { ok: false, failure: "elsewhere", rows: placesOf(detail) }
        : null;
    default:
      return null;
  }
}

const id = z.string().refine(isUuid);

const ImportAnswer = z.object({
  import: id.nullable(),
  rows: z.array(
    z.object({
      i: z.int().positive(),
      status: z.enum(PEOPLE_IMPORT_STATUSES),
      invite: id.nullable(),
    }),
  ),
});

const UndoAnswer = z.object({
  cancelled: z.int().min(0),
  kept: z.int().min(0),
});

/** The rows as the database takes them: `named_role` only when there is one. */
function rowsFor(people: readonly ImportPerson[]) {
  return people.map((person) => ({
    name: person.name,
    phone: person.phone,
    role: person.role,
    ...(person.namedRole ? { named_role: person.namedRole } : {}),
    role_from_line: person.roleFromLine,
  }));
}

async function importPeople(
  fn: "team_import_people" | "admin_import_people",
  actorId: string,
  businessId: string,
  people: readonly ImportPerson[],
): Promise<PeopleImportDbResult> {
  // As the screen read them, again: never a row it couldn't have sent.
  const rows = peopleImportRows.safeParse(people);
  if (!rows.success) return { ok: false, failure: "changed" };
  const { data, error } = await createAdminClient().rpc(fn, {
    actor: actorId,
    business: businessId,
    people: rowsFor(rows.data),
  });
  if (error) {
    // Before the migration reaches a project: the import isn't there yet.
    if (isMissingFunction(error)) return { ok: false, failure: "failed" };
    const known = peopleImportError(error.code, error.hint, error.details);
    if (known) return known;
    // The database's messages hold no name and no number.
    throw new Error(`Could not import: ${error.message}`);
  }
  const answer = ImportAnswer.parse(data);
  if (
    answer.rows.length !== rows.data.length ||
    answer.rows.some((row, at) => row.i !== at + 1)
  ) {
    throw new Error("Could not import: the answer has another number of rows");
  }
  return { ok: true, importId: answer.import, rows: answer.rows };
}

/**
 * Someone who edits the team invites a list to their business from the Team
 * screen (`public.team_import_people`), giving by their own role: team.edit,
 * the rank rule, and for anyone but an owner no role that sees pay or holds
 * what they don't, as one invite asks. The rows are `againstTeam`'s `send`,
 * parsed again here (`peopleImportRows`). Never says where else a number
 * works (#80).
 */
export function importPeopleToTeam(
  actorId: string,
  businessId: string,
  people: readonly ImportPerson[],
): Promise<PeopleImportDbResult> {
  return importPeople("team_import_people", actorId, businessId, people);
}

/**
 * The ConceptApp team invites a list to a business from the console
 * (`public.admin_import_people`), giving as an owner, as one invite from the
 * console does; a number on another business's staff refuses it all
 * (`elsewhere`, with the rows).
 */
export function importPeopleFromConsole(
  actorId: string,
  businessId: string,
  people: readonly ImportPerson[],
): Promise<PeopleImportDbResult> {
  return importPeople("admin_import_people", actorId, businessId, people);
}

async function undoImport(
  fn: "team_import_undo" | "admin_import_undo",
  actorId: string,
  businessId: string,
  importId: string,
): Promise<PeopleUndoDbResult> {
  if (!isUuid(importId)) return { ok: false, failure: "changed" };
  const { data, error } = await createAdminClient().rpc(fn, {
    actor: actorId,
    business: businessId,
    batch: importId,
  });
  if (error) {
    if (isMissingFunction(error)) return { ok: false, failure: "failed" };
    if (error.code === "42501") return { ok: false, failure: "notAllowed" };
    if (error.code === "P0002") return { ok: false, failure: "changed" };
    throw new Error(`Could not take the import back: ${error.message}`);
  }
  const answer = UndoAnswer.parse(data);
  return { ok: true, cancelled: answer.cancelled, kept: answer.kept };
}

/**
 * Takes back an import from the Team screen (`public.team_import_undo`): its
 * invites still with no link are cancelled, kept as rows for the log, and any
 * that got a link or were claimed stay. `notAllowed` when one of them is to
 * a role the actor doesn't give by rank. A second call cancels none.
 */
export function undoTeamImport(
  actorId: string,
  businessId: string,
  importId: string,
): Promise<PeopleUndoDbResult> {
  return undoImport("team_import_undo", actorId, businessId, importId);
}

/** The same from the console (`public.admin_import_undo`), as an owner. */
export function undoConsoleImport(
  actorId: string,
  businessId: string,
  importId: string,
): Promise<PeopleUndoDbResult> {
  return undoImport("admin_import_undo", actorId, businessId, importId);
}

const MemberRow = z.object({
  user_id: z.string(),
  profiles: z
    .object({ full_name: z.string().nullable(), phone: z.string().nullable() })
    .nullable(),
});

const InviteRow = z.object({
  id: z.string(),
  full_name: z.string().nullable(),
  phone: z.string(),
  role: z.enum(ROLES),
  named_role: z.string().nullable(),
  expires_at: z.string(),
  link_pending: z.boolean(),
});

/**
 * The business's team as the console's import checks a paste against it
 * (`againstTeam`): its active members' numbers and the names the business
 * shows them by, and its invites nobody claimed. The console gives as an
 * owner, so it may update any invite still with no link to a manager or a
 * worker (`touchable`), but one to a role the business named that was
 * removed since: the database leaves that as it is, as the Team screen does.
 * Page by page: nothing caps a team, and expired invites pile up.
 */
export async function consoleKnownTeam(
  businessId: string,
  now: Date = new Date(),
): Promise<KnownTeam> {
  const admin = createAdminClient();
  const [members, invites, live, names] = await Promise.all([
    allPages((first, last) =>
      admin
        .from("memberships")
        .select("user_id, profiles (full_name, phone)")
        .eq("business_id", businessId)
        .eq("active", true)
        .order("user_id")
        .range(first, last),
    ),
    allPages((first, last) =>
      admin
        .from("invites")
        .select(
          "id, full_name, phone, role, named_role, expires_at, link_pending",
        )
        .eq("business_id", businessId)
        .is("claimed_at", null)
        .order("id")
        .range(first, last),
    ),
    allPages((first, last) =>
      admin
        .from("business_roles")
        .select("id")
        .eq("business_id", businessId)
        .is("archived_at", null)
        .order("id")
        .range(first, last),
    ),
    memberNames(admin, businessId),
  ]);
  const liveRoles = new Set(live.map((row) => row.id.toLowerCase()));
  const at = now.getTime();
  return knownTeamOf(
    z
      .array(MemberRow)
      .parse(members)
      .map((row) => ({
        phone: row.profiles?.phone ?? null,
        name: nameIn(names, row.user_id, row.profiles?.full_name),
      })),
    z
      .array(InviteRow)
      .parse(invites)
      .map(
        (row): KnownInvite => ({
          id: row.id,
          phone: row.phone,
          name: row.full_name,
          role: row.role,
          namedRole: row.named_role,
          linkPending: row.link_pending,
          expired: Date.parse(row.expires_at) <= at,
          touchable:
            (row.role === "manager" || row.role === "worker") &&
            (row.named_role === null ||
              liveRoles.has(row.named_role.toLowerCase())),
        }),
      ),
  );
}
