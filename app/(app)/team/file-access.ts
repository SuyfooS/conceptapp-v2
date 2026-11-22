import "server-only";
import type { EmployeeFileSettings } from "@domain/employee-file-settings";
import { seesFiles } from "@domain/file-holders";
import { canSeeTeam } from "@domain/team";
import { clockAt } from "@domain/today";
import { canWrite } from "@domain/view-as";
import { currentMember } from "../member";
import { currentModuleSettings, currentModules } from "../modules";

/*
 * Who reads the business's hiring files as a holder (profile H6a): the
 * owners and the accountant always, and whoever an owner gives people.files,
 * while the module is on. Shared by the file's actions (`fileHolder`) and
 * its pages (`currentFilesReader`): the session's own person, never an id
 * from the browser; never a view session, which the database refuses
 * anyway; the business the screen was drawn for, which an action is bound
 * to on the page. Whether they confirmed the duties is the database's to
 * say (`getFileHolderState`). Nothing here logs a value.
 */

export type FileHolder = {
  userId: string;
  businessId: string;
  businessName: string;
  timeZone: string;
  /** The business's day, `YYYY-MM-DD`. */
  today: string;
  year: number;
  /** The business's settings for the file, as stored (H5b). */
  settings: EmployeeFileSettings;
  /** They see the team too (an owner): the file leads back to the profile. */
  seesTeam: boolean;
};

/** Why an action on a holder's file was refused, before anything was asked. */
export type HolderFailure =
  | "viewOnly"
  | "businessChanged"
  | "off"
  | "noAccess"
  | "failed";

/**
 * For the file's actions: the session's person, not viewing, in the
 * business the screen was drawn for, with the module on and people.files
 * held.
 */
export async function fileHolder(
  business: unknown,
): Promise<FileHolder | { failure: HolderFailure }> {
  const [member, enabled, settings] = await Promise.all([
    currentMember(),
    currentModules(),
    currentModuleSettings("employee_files"),
  ]);
  const membership = member?.membership;
  if (!member || !membership) return { failure: "failed" };
  if (!canWrite(member.viewing)) return { failure: "viewOnly" };
  if (business !== membership.business.id) {
    return { failure: "businessChanged" };
  }
  if (!enabled.includes("employee_files")) return { failure: "off" };
  if (!seesFiles(membership, enabled)) return { failure: "noAccess" };
  const timeZone = membership.business.place.timeZone;
  const today = clockAt(new Date(), timeZone).date;
  return {
    userId: member.userId,
    businessId: membership.business.id,
    businessName: membership.business.name,
    timeZone,
    today,
    year: Number(today.slice(0, 4)),
    settings,
    seesTeam: canSeeTeam(membership),
  };
}

/**
 * For the pages: who reads the files here, and how. A holder (not viewing);
 * whoever sees the team without the files, or anyone in a view session who
 * would see either, as `team` (counts, never a file), with whether they see
 * the team (a view as the accountant reads the files alone, so its way back
 * is the team's files); anyone else, or the module off, `none`.
 */
export type FilesReader =
  | { kind: "none" }
  | { kind: "holder"; holder: FileHolder }
  | {
      kind: "team";
      viewing: boolean;
      /** They see the team too: a file leads back to the profile. */
      seesTeam: boolean;
      businessId: string;
      businessName: string;
      timeZone: string;
    };

export async function currentFilesReader(): Promise<FilesReader> {
  const [member, enabled] = await Promise.all([
    currentMember(),
    currentModules(),
  ]);
  const membership = member?.membership;
  if (!member || !membership || !enabled.includes("employee_files")) {
    return { kind: "none" };
  }
  const holds = seesFiles(membership, enabled);
  const team = canSeeTeam(membership);
  if (!holds && !team) return { kind: "none" };
  if (holds && canWrite(member.viewing)) {
    const holder = await fileHolder(membership.business.id);
    return "failure" in holder ? { kind: "none" } : { kind: "holder", holder };
  }
  return {
    kind: "team",
    viewing: !canWrite(member.viewing),
    seesTeam: team,
    businessId: membership.business.id,
    businessName: membership.business.name,
    timeZone: membership.business.place.timeZone,
  };
}
