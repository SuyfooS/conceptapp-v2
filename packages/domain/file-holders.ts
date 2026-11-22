import {
  type BankReview,
  FILE_GROUPS,
  type FileGroup,
  type FileStatus,
  type TaxYearStatus,
} from "./employee-file";
import {
  holdsPermission,
  type ModuleKey,
  type Role,
  type Viewer,
} from "./modules";

/*
 * The hiring file as its holders read it (profile H6a, issue #82 §2.4,
 * §3.3): the owners and the accountant always, and whoever an owner gives
 * people.files. Who sees the files, how long a file stays open after the
 * SMS code (15 minutes from the last activity, the step-up kept in a
 * cookie on `/team`), and the status lines the team screen, a person's
 * page and the accountant's Home draw from `public.employee_file_status`:
 * a holder's by the groups, anyone else's by a count, never a group's name.
 * Pure: the same in the browser and on the server.
 */

/** The step-up's cookie, on the team's screens only. */
export const FILE_STEP_UP_COOKIE = "ca_file_open";
export const FILE_STEP_UP_PATH = "/team";
/** A file locks this long after the last activity on its screen. */
export const FILE_IDLE_MS = 15 * 60_000;
/** Activity slides the server's moment at most once in this long. */
export const FILE_TOUCH_EVERY_MS = 60_000;
/** How far ahead a moment may be, for two clocks a little apart. */
export const FILE_CLOCK_SKEW_MS = 60_000;

/** The file's module on, and the viewer holds people.files. */
export function seesFiles(
  viewer: Viewer,
  enabled: readonly ModuleKey[],
): boolean {
  return (
    enabled.includes("employee_files") &&
    holdsPermission(viewer, "people.files")
  );
}

/**
 * A step-up at `at` still counts at `now`: within the 15 minutes, and not
 * more than a minute ahead (two clocks may differ that much, no more).
 */
export function stepUpFresh(at: number | null, now: number): boolean {
  if (at === null || !Number.isFinite(at)) return false;
  const since = now - at;
  return since <= FILE_IDLE_MS && since >= -FILE_CLOCK_SKEW_MS;
}

/**
 * How long a step-up at `at` still counts at `now`: the 15 minutes less its
 * age, never more than 15 minutes (a moment a little ahead counts as now);
 * null once it doesn't count.
 */
export function stepUpLeft(at: number | null, now: number): number | null {
  if (at === null || !stepUpFresh(at, now)) return null;
  return Math.min(FILE_IDLE_MS, FILE_IDLE_MS - (now - at));
}

/** When an idle screen locks, from its last activity. */
export function idleLocksAt(lastActivity: number): number {
  return lastActivity + FILE_IDLE_MS;
}

/** Whether an activity at `now` should slide the server's moment. */
export function touchDue(lastTouch: number | null, now: number): boolean {
  return lastTouch === null || now - lastTouch >= FILE_TOUCH_EVERY_MS;
}

/**
 * One person's file as a status line says it: complete; for a holder, the
 * groups missing in FILE_GROUPS' order and an account to look at; for
 * anyone else who sees the team, how many are missing and nothing more.
 */
export type FileLine =
  | { kind: "complete"; bankReview: BankReview | null }
  | { kind: "groups"; groups: FileGroup[]; bankReview: BankReview | null }
  | { kind: "count"; count: number };

export function fileLineOf(status: FileStatus): FileLine {
  const { detail } = status;
  if (detail) {
    const groups = FILE_GROUPS.filter((group) =>
      detail.missing.includes(group),
    );
    return groups.length === 0
      ? { kind: "complete", bankReview: detail.bank_review }
      : { kind: "groups", groups, bankReview: detail.bank_review };
  }
  // Never a group's name without the holder's detail: a count alone.
  return status.complete || status.missing === 0
    ? { kind: "complete", bankReview: null }
    : { kind: "count", count: status.missing };
}

/**
 * This year's Form 101 as a status line says it: for a holder, its status
 * and the day an updated one is due; for anyone else, in or not, a returned
 * one not in and one due again in, so nothing hints at a change in
 * someone's life.
 */
export type Form101Line =
  | {
      kind: "holder";
      year: number;
      status: TaxYearStatus | null;
      changeDueBy: string | null;
    }
  | { kind: "team"; in: boolean };

export function form101LineOf(status: FileStatus): Form101Line {
  const { detail } = status;
  return detail
    ? {
        kind: "holder",
        year: detail.tax_year,
        status: detail.status,
        changeDueBy: detail.change_due_by,
      }
    : { kind: "team", in: status.form101_in };
}

/** The accountant's Home card: how many files, and what waits in them. */
export type FilesHome = {
  files: number;
  /** Files with anything missing. */
  missing: number;
  /** This year's 101s not in (none while the business takes it outside the app). */
  form101Open: number;
  /** Accounts a holder should look at: new, warned by the check, or "לא שיניתי". */
  bankReviews: number;
};

export function filesHomeOf(
  statuses: readonly FileStatus[],
  form101: boolean,
): FilesHome {
  return {
    files: statuses.length,
    missing: statuses.filter((status) => !status.complete).length,
    form101Open: form101
      ? statuses.filter((status) => !status.form101_in).length
      : 0,
    bankReviews: statuses.filter((status) => status.detail?.bank_review).length,
  };
}

/**
 * The staff a files-only reader sees (the accountant, who doesn't see the
 * team): active managers and workers, whose files the business keeps.
 * Owners aren't counted, and an accountant has no file here.
 */
export function fileStaff<T extends { role: Role }>(
  members: readonly T[],
): T[] {
  return members.filter(
    (member) => member.role === "manager" || member.role === "worker",
  );
}
