"use server";

import {
  importPeopleToTeam,
  type PeopleImportDbResult,
  undoTeamImport,
} from "@db/people-import";
import { isUuid } from "@domain/activity";
import type { Role, Viewer } from "@domain/modules";
import { type ImportPerson, peopleImportRows } from "@domain/people-import";
import {
  canEditTeam,
  type GivableNamedRole,
  parseTeamInvite,
  roleChoiceKey,
} from "@domain/team";
import { canWrite } from "@domain/view-as";
import { refresh, revalidatePath } from "next/cache";
import { currentMember } from "../../member";
import { currentGivableNamedRoles, currentOwnerOnlyRoles } from "../../team";
import type { PeopleImportResult, PeopleUndoResult } from "./import-types";

/*
 * Someone who edits the team invites a pasted list from the Team screen
 * (inviting from a list, part 5; Orel, 25 November 2026: owners and
 * managers paste on /team, after the console). The screen reads the list on
 * the device and sends only each person's name, number and role; here they
 * are read again as the invite form would take each one from this person
 * (`parseTeamInvite`, and no role that sees pay unless they are an owner),
 * and the database decides last, under a lock on the business
 * (`public.team_import_people`). Every invite is saved with no link and
 * nobody gets anything: each link is made on the done screen, or later on
 * /team, one person at a time. Both actions are bound on the page to the
 * business it was drawn for: one that arrives after a switch of business is
 * refused, never made in the other. Nothing here logs a name, a number or a
 * Zod error, whose issues can hold them, and nothing says where else a
 * number works (#80).
 */

type Importer =
  | { userId: string; viewer: Viewer }
  | { failure: "noPermission" | "businessChanged" | "viewOnly" | "changed" };

/**
 * The signed-in person who edits the team of `business` (`canEditTeam`), as
 * the invite form asks (`noPermission`), in `changer`'s order: the business
 * the page was bound to, then a session viewing as someone, who changes
 * nothing.
 */
async function importer(business: unknown): Promise<Importer> {
  const member = await currentMember();
  const membership = member?.membership;
  if (!member || !membership || !canEditTeam(membership)) {
    return { failure: "noPermission" };
  }
  if (!isUuid(business)) return { failure: "changed" };
  if (membership.business.id.toLowerCase() !== business.toLowerCase()) {
    return { failure: "businessChanged" };
  }
  if (!canWrite(member.viewing)) return { failure: "viewOnly" };
  return { userId: member.userId, viewer: membership };
}

/**
 * A row as the invite form would take it from this person, against the
 * business's live named roles they may give: "roleGone" for a named role it
 * no longer has, "changed" for anything else the screen couldn't have sent
 * them (a role above their rank, one that sees pay when they aren't an
 * owner, a named role holding what they don't, a name or a number read
 * otherwise), else null.
 */
function parityOf(
  person: ImportPerson,
  viewer: Viewer,
  named: readonly GivableNamedRole[],
  ownerOnly: readonly Role[],
): "roleGone" | "changed" | null {
  if (
    person.namedRole !== null &&
    !named.some((role) => role.id === person.namedRole)
  ) {
    return "roleGone";
  }
  // `parseTeamInvite` holds a role to the rank rule and what it holds, never
  // to pay: only an owner gives a role that sees it (a named role never does).
  if (person.namedRole === null && ownerOnly.includes(person.role)) {
    return "changed";
  }
  const parsed = parseTeamInvite(
    { name: person.name, phone: person.phone, role: roleChoiceKey(person) },
    viewer,
    named,
  );
  return parsed.ok &&
    parsed.value.name === person.name &&
    parsed.value.phone === person.phone &&
    parsed.value.role === person.role &&
    parsed.value.namedRole === person.namedRole
    ? null
    : "changed";
}

/** The database's refusal, in the screen's words; never where else a number works. */
function refusalOf(
  result: Exclude<PeopleImportDbResult, { ok: true }>,
): Exclude<PeopleImportResult, { ok: true }> {
  switch (result.failure) {
    // The console's alone: the Team screen's function never checks it.
    case "elsewhere":
      return { ok: false, failure: "failed" };
    case "tooManyOpen":
      return result.open === null
        ? { ok: false, failure: "tooManyOpen" }
        : { ok: false, failure: "tooManyOpen", open: result.open };
    default:
      return { ok: false, failure: result.failure };
  }
}

/**
 * Invites the people a pasted list holds to the business, all or none, each
 * with no link yet: the rows `againstTeam` sends, without their `line`.
 * Anything the screen couldn't have sent this person (`changed`, or
 * `roleGone`) refuses them all before the database is asked. The answer
 * holds each row's status and invite id: no link, no token. The pages read
 * the team again, so the done screen's links and a second list are made and
 * read against the invites this one made.
 */
export async function importPeopleAction(
  business: string,
  input: unknown,
): Promise<PeopleImportResult> {
  const actor = await importer(business);
  if ("failure" in actor) return { ok: false, failure: actor.failure };
  const rows = peopleImportRows.safeParse(input);
  if (!rows.success) return { ok: false, failure: "changed" };
  try {
    const [named, ownerOnly] = await Promise.all([
      currentGivableNamedRoles(),
      currentOwnerOnlyRoles(),
    ]);
    for (const person of rows.data) {
      const refused = parityOf(person, actor.viewer, named, ownerOnly);
      if (refused) return { ok: false, failure: refused };
    }
    const result = await importPeopleToTeam(actor.userId, business, rows.data);
    if (!result.ok) return refusalOf(result);
    revalidatePath("/team");
    refresh();
    return {
      ok: true,
      importId: result.importId,
      rows: result.rows.map(({ i, status, invite }) => ({ i, status, invite })),
    };
  } catch (error) {
    console.error("importPeopleToTeam failed", (error as Error).message);
    return { ok: false, failure: "failed" };
  }
}

/**
 * Takes an import back from its done screen ("מחיקת ההזמנות מהרשימה", held
 * for its "ביטול"): its invites that still have no link are cancelled and
 * kept as rows for the log; any whose link was made meanwhile, on the done
 * screen too, stay (`kept`), as do any claimed. Refused (`notAllowed`) when
 * one of them is to a role this person doesn't give by rank. A second call
 * cancels none.
 */
export async function undoPeopleImportAction(
  business: string,
  importId: unknown,
): Promise<PeopleUndoResult> {
  const actor = await importer(business);
  if ("failure" in actor) return { ok: false, failure: actor.failure };
  if (!isUuid(importId)) return { ok: false, failure: "changed" };
  try {
    const result = await undoTeamImport(actor.userId, business, importId);
    if (!result.ok) return { ok: false, failure: result.failure };
    revalidatePath("/team");
    refresh();
    return { ok: true, cancelled: result.cancelled, kept: result.kept };
  } catch (error) {
    console.error("undoTeamImport failed", (error as Error).message);
    return { ok: false, failure: "failed" };
  }
}
