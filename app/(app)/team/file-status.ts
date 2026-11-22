import "server-only";
import { getEmployeeFileStatus } from "@db/employee-files";
import type { FileStatus } from "@domain/employee-file";
import { form101SetupOf } from "@domain/employee-file-settings";
import {
  type FileReview,
  type FilesHome,
  fileReviewsOf,
  filesHomeOf,
  seesFiles,
} from "@domain/file-holders";
import { canSeeTeam } from "@domain/team";
import { clockAt } from "@domain/today";
import { canWrite } from "@domain/view-as";
import { unstable_rethrow } from "next/navigation";
import { cache } from "react";
import { currentMember } from "../member";
import { currentModuleSettings, currentModules } from "../modules";

/*
 * How complete each manager's and worker's hiring file is, for the team's
 * screens and the accountant's Home (profile H6a), from
 * `public.employee_file_status`: never logged and never a value. A holder
 * (people.files, not viewing) reads the groups missing, this year's 101 and
 * an account to look at; whoever sees the team without the files, and any
 * view session, a count and whether the 101 is in, which is all the
 * database gives them. Read once per request, never cached across
 * requests; a read that fails leaves the lines out and never takes the
 * screen down.
 */

export type TeamFiles = {
  /** Holder words (the database's detail), or counts. */
  reader: "holder" | "team";
  /** Reads the files without seeing the team (the accountant). */
  filesOnly: boolean;
  /** The tax year the 101 lines are for: the business's this year. */
  year: number;
  /** The business takes Form 101 in the app. */
  form101: boolean;
  /** The business's zone, for the day a file last changed (H6b-2). */
  timeZone: string;
  /** By person; a plain object, so a page's props can carry it. */
  byPerson: Record<string, FileStatus>;
};

/** A read's error by its code and kind, never its message. */
function said(what: string, error: unknown): null {
  unstable_rethrow(error);
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : "without a code";
  const kind = error instanceof Error ? error.name : typeof error;
  console.error(what, code, kind);
  return null;
}

/**
 * The status lines of the signed-in person's business: null with the module
 * off, for someone who neither sees the team nor holds the files, and when
 * the read failed.
 */
export const currentTeamFiles = cache(async (): Promise<TeamFiles | null> => {
  try {
    const [member, enabled, settings] = await Promise.all([
      currentMember(),
      currentModules(),
      currentModuleSettings("employee_files"),
    ]);
    const membership = member?.membership;
    if (!member || !membership || !enabled.includes("employee_files")) {
      return null;
    }
    const holds = seesFiles(membership, enabled);
    const team = canSeeTeam(membership);
    if (!holds && !team) return null;
    const statuses = await getEmployeeFileStatus(membership.business.id);
    const today = clockAt(new Date(), membership.business.place.timeZone).date;
    return {
      reader: holds && canWrite(member.viewing) ? "holder" : "team",
      filesOnly: !team,
      year: Number(today.slice(0, 4)),
      form101: form101SetupOf(settings).way !== "off",
      timeZone: membership.business.place.timeZone,
      byPerson: Object.fromEntries(statuses),
    };
  } catch (error) {
    return said("reading the files' status failed", error);
  }
});

/**
 * The accountant's Home card (`AccountantHome`): how many files, how many
 * miss anything, the 101s not in and the accounts to look at. Only for a
 * holder who isn't viewing: a view reads no detail, so its counts would be
 * wrong. Null otherwise, and when the read failed.
 */
export async function currentFilesHome(): Promise<
  (FilesHome & { form101: boolean }) | null
> {
  const files = await currentTeamFiles();
  if (files?.reader !== "holder") return null;
  return {
    ...filesHomeOf(Object.values(files.byPerson), files.form101),
    form101: files.form101,
  };
}

/**
 * The accounts to look at, for Today's owner card (H6b-1): only for a
 * holder who sees the team and isn't viewing (an owner), since the
 * accountant has a card of their own and a view reads no detail. "לא
 * שיניתי" first, then a number the check doubts, then new ones; Today
 * orders each kind by name. Null otherwise, and when the read failed.
 */
export async function currentFileReviews(): Promise<FileReview[] | null> {
  const files = await currentTeamFiles();
  if (files?.reader !== "holder" || files.filesOnly) return null;
  return fileReviewsOf(Object.values(files.byPerson));
}
