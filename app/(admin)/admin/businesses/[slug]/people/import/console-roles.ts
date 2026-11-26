import type { Role, Viewer } from "@domain/modules";
import { type ImportRoles, importRolesOf } from "@domain/people-import";
import { type GivableNamedRole, inviteChoices } from "@domain/team";

/** The console gives as an owner does: every staff role, none blocked. */
export const CONSOLE_GIVER: Viewer = { role: "owner", perms: [] };

/**
 * The roles a pasted list is read against in the console: managers and
 * workers and the business's named roles on them, none blocked, since the
 * ConceptApp team may give pay as an owner may (`private.invite_closed`);
 * owners and accountants one at a time, from "הוספת אדם". `labels` are the
 * business's own words for the built-in roles, so the team can paste the
 * words it uses.
 */
export function consoleImportRoles(
  named: readonly GivableNamedRole[],
  labels: Record<Role, string>,
): ImportRoles {
  return importRolesOf({
    choices: inviteChoices(CONSOLE_GIVER, named, []),
    named: named.map(({ holds: _holds, ...role }) => role),
    labels,
  });
}
