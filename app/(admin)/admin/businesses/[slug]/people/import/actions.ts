"use server";

import { getPlatformStaff } from "@db/admin";
import {
  importPeopleFromConsole,
  type PeopleImportDbResult,
  undoConsoleImport,
} from "@db/people-import";
import { getGivableNamedRoles } from "@db/roles";
import { isUuid } from "@domain/activity";
import { SLUG_MAX } from "@domain/business";
import { type ImportPerson, peopleImportRows } from "@domain/people-import";
import { platformCan } from "@domain/platform";
import {
  type GivableNamedRole,
  parseTeamInvite,
  roleChoiceKey,
} from "@domain/team";
import { refresh, revalidatePath } from "next/cache";
import { z } from "zod";
import type {
  PeopleImportResult,
  PeopleUndoResult,
} from "@/app/(app)/team/import/import-types";
import { CONSOLE_GIVER } from "./console-roles";

/*
 * The ConceptApp team adds a business's people from a pasted list, at setup
 * (inviting from a list, part 4; Orel, 25 November 2026: the console pastes
 * first). The screen reads the list on the device and sends only each
 * person's name, number and role; here they are read again, as the console
 * gives (an owner's rules, as "הוספת אדם" does), and the database decides
 * last, under a lock on the business (`public.admin_import_people`). Every
 * invite is saved with no link and nobody gets anything: the owners send
 * each link from /team. Both actions are bound on the page to the business
 * it was drawn for, and check the team member again. Nothing here logs a
 * name, a number or a Zod error, whose issues can hold them.
 */

/** The business the page was drawn for, as it binds it. */
const businessRef = z.strictObject({
  id: z.string().refine(isUuid),
  slug: z
    .string()
    .max(SLUG_MAX)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
});

/** Someone on the team who adds people to businesses. */
async function inviter(): Promise<string | null> {
  const staff = await getPlatformStaff();
  return staff && platformCan(staff.role, "staff.invite") ? staff.userId : null;
}

/**
 * A row as the console's own form would take it, against the business's
 * live named roles: "roleGone" for a named role it no longer has, "changed"
 * for anything else the screen couldn't have sent (a named role on another
 * base, a name or a number read otherwise), else null.
 */
function parityOf(
  person: ImportPerson,
  named: readonly GivableNamedRole[],
): "roleGone" | "changed" | null {
  if (
    person.namedRole !== null &&
    !named.some((role) => role.id === person.namedRole)
  ) {
    return "roleGone";
  }
  const parsed = parseTeamInvite(
    { name: person.name, phone: person.phone, role: roleChoiceKey(person) },
    CONSOLE_GIVER,
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

/** The database's refusal, in the screen's words. */
function refusalOf(
  result: Exclude<PeopleImportDbResult, { ok: true }>,
): Exclude<PeopleImportResult, { ok: true }> {
  switch (result.failure) {
    case "elsewhere":
      return { ok: false, failure: "elsewhere", rows: result.rows };
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
 * with no link yet: the rows `againstTeam` sends, without their `line`. A
 * number on another business's staff refuses them all (`elsewhere`, with
 * the rows' places), and so does anything the screen couldn't have sent
 * (`changed`), before the database is asked. The answer holds each row's
 * status and invite id: no link, no token. The page reads the team again,
 * so a second list is read against the invites this one made.
 */
export async function importConsolePeopleAction(
  business: { id: string; slug: string },
  input: unknown,
): Promise<PeopleImportResult> {
  const actor = await inviter();
  if (!actor) return { ok: false, failure: "noPermission" };
  const where = businessRef.safeParse(business);
  const rows = peopleImportRows.safeParse(input);
  if (!where.success || !rows.success) return { ok: false, failure: "changed" };
  try {
    const named = await getGivableNamedRoles(where.data.id);
    for (const person of rows.data) {
      const refused = parityOf(person, named);
      if (refused) return { ok: false, failure: refused };
    }
    const result = await importPeopleFromConsole(
      actor,
      where.data.id,
      rows.data,
    );
    if (!result.ok) return refusalOf(result);
    revalidatePath(`/admin/businesses/${where.data.slug}`);
    refresh();
    return {
      ok: true,
      importId: result.importId,
      rows: result.rows.map(({ i, status, invite }) => ({ i, status, invite })),
    };
  } catch (error) {
    console.error("importPeopleFromConsole failed", (error as Error).message);
    return { ok: false, failure: "failed" };
  }
}

/**
 * Takes an import back from its done card ("מחיקת ההזמנות מהרשימה", held
 * for its "ביטול"): its invites that still have no link are cancelled and
 * kept as rows for the log; any that got a link meanwhile stay (`kept`), as
 * do any claimed. A second call cancels none.
 */
export async function undoConsoleImportAction(
  business: { id: string; slug: string },
  importId: unknown,
): Promise<PeopleUndoResult> {
  const actor = await inviter();
  if (!actor) return { ok: false, failure: "noPermission" };
  const where = businessRef.safeParse(business);
  if (!where.success || !isUuid(importId)) {
    return { ok: false, failure: "changed" };
  }
  try {
    const result = await undoConsoleImport(actor, where.data.id, importId);
    if (!result.ok) return { ok: false, failure: result.failure };
    revalidatePath(`/admin/businesses/${where.data.slug}`);
    refresh();
    return { ok: true, cancelled: result.cancelled, kept: result.kept };
  } catch (error) {
    console.error("undoConsoleImport failed", (error as Error).message);
    return { ok: false, failure: "failed" };
  }
}
