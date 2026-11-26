import {
  type CheckedLine,
  type ImportPerson,
  type KnownInvite,
  type KnownTeam,
  writtenRoleOf,
} from "@domain/people-import";
import type { RoleChoice } from "@domain/team";
import type { PendingRow } from "../pending-links";
import type { PeopleImportResult } from "./import-types";

/**
 * Who the Team screen's done screen sends links to, after an import
 * (inviting from a list, part 5), with no React: everyone on the list whose
 * invite has no link yet and is the viewer's to make, each made at the
 * moment of sending ("יצירת קישור", then WhatsApp or a copy; Orel, 25
 * November 2026), and those whose earlier link ran out, which "קישור חדש"
 * opens again. Read from the database's answer for the rows sent (never
 * the preview's outcome) and from the team the screen read at the press.
 */

/** Someone on the list whose earlier link ran out: "קישור חדש" opens it again. */
export type ExpiredRow = {
  id: string;
  /** The invite's own name; null for none, whose avatar is a face, as on /team. */
  name: string | null;
  /** That name as the Team screen shows it ("בלי שם" for none). */
  shown: string;
  /** E.164, as the invite keeps it. */
  phone: string;
  /** Its role in the business's words. */
  role: string;
};

type Answered = Extract<PeopleImportResult, { ok: true }>["rows"];

const roleOfInvite = (invite: KnownInvite | undefined): RoleChoice | null =>
  invite ? { role: invite.role, namedRole: invite.namedRole } : null;

/**
 * The done screen's two lists. `links`: each row the database made, updated
 * or found as the line says (`created`, `updated`, `same`) with its invite,
 * then each line the screen itself left out as already waiting with no link
 * (`same`, an invite it may change, so one whose link it may make), once
 * each, with the role it ends with (`writtenRoleOf`; one the screen can't
 * know is read from the invite it read, else left unsaid). `expired`: each
 * line whose number has an invite whose link ran out, one the viewer may
 * renew (`touchable`); one they may not stays for its own words on /team.
 * Nothing the database left as it was otherwise (a link made meanwhile, an
 * owner's or an accountant's invite) is in either.
 */
export function doneLinksOf({
  rows,
  sent,
  lines,
  team,
  labelOf,
  noName,
}: {
  /** The database's answer, one per row sent, `i` its place from 1. */
  rows: Answered;
  /** The rows sent, in their order, with each one's line. */
  sent: readonly (ImportPerson & { line: number })[];
  /** The paste checked against the team at the press (`againstTeam`). */
  lines: readonly CheckedLine[];
  /** The team the screen read at the press. */
  team: KnownTeam;
  /** A role in the business's words. */
  labelOf: (role: RoleChoice) => string;
  /** What an invite with no name is shown as. */
  noName: string;
}): { links: PendingRow[]; expired: ExpiredRow[] } {
  const byId = new Map(team.invites.map((invite) => [invite.id, invite]));
  const byPhone = new Map(team.invites.map((invite) => [invite.phone, invite]));
  const lineOf = (at: number) => lines.find((line) => line.line === at);
  const label = (role: RoleChoice | null) => (role ? labelOf(role) : "");

  const links = new Map<string, PendingRow>();
  const add = (id: string, person: ImportPerson, role: RoleChoice | null) => {
    if (links.has(id)) return;
    links.set(id, {
      id,
      name: person.name,
      shown: person.name,
      phone: person.phone,
      role: label(role),
      send: "link",
      cancels: false,
    });
  };

  for (const row of rows) {
    const person = sent[row.i - 1];
    if (!person || row.invite === null) continue;
    const line = lineOf(person.line);
    if (row.status === "created" || row.status === "updated") {
      add(
        row.invite,
        person,
        writtenRoleOf(row.status, person, line) ??
          roleOfInvite(byId.get(row.invite)),
      );
    } else if (row.status === "same") {
      add(
        row.invite,
        person,
        person.roleFromLine
          ? { role: person.role, namedRole: person.namedRole }
          : (line?.invite ?? roleOfInvite(byId.get(row.invite))),
      );
    }
  }

  for (const line of lines) {
    if (line.kind !== "person" || line.outcome !== "same") continue;
    const invite = byPhone.get(line.person.phone);
    if (!invite?.linkPending || !invite.touchable) continue;
    add(invite.id, line.person, line.invite ?? roleOfInvite(invite));
  }

  const expired = new Map<string, ExpiredRow>();
  for (const line of lines) {
    if (line.outcome !== "expired") continue;
    const phone =
      line.kind === "person"
        ? line.person.phone
        : line.kind === "problem"
          ? line.phone
          : undefined;
    const invite = phone === undefined ? undefined : byPhone.get(phone);
    if (!invite || invite.linkPending || !invite.expired || !invite.touchable) {
      continue;
    }
    if (expired.has(invite.id)) continue;
    expired.set(invite.id, {
      id: invite.id,
      name: invite.name,
      shown: invite.name ?? noName,
      phone: invite.phone,
      role: label(roleOfInvite(invite)),
    });
  }

  return { links: [...links.values()], expired: [...expired.values()] };
}
