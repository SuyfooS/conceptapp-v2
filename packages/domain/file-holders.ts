import { addDays } from "./availability";
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

// ---------------------------------------------------------------------------
// What a holder does in a file (profile H6b)

/**
 * The log's rows "מה קרה בתיק" lists, besides a number's reveal (an
 * `employee.view` with `id` or `bank_account`): the file's changes, its
 * sending, the 101's marks, the account confirmed or disputed, and the
 * parts handed directly. Never the daily read of the file itself.
 */
export const FILE_HISTORY_ACTIONS = [
  "employee.details",
  "employee.submit",
  "employee.tax_year",
  "employee.bank_ack",
  "employee.bank_disputed",
  "employee.direct",
] as const;

/** The newest lines "מה קרה בתיק" shows. */
export const FILE_HISTORY_SIZE = 40;

/** The pension is missing and its day to choose (`dueOn`) is behind `today`: the business chooses now. */
export function pensionPassed(
  missing: readonly FileGroup[],
  dueOn: string | null,
  today: string,
): boolean {
  return missing.includes("pension") && dueOn !== null && dueOn < today;
}

/** An account a holder should look at, by person. */
export type FileReview = { userId: string; review: BankReview };

/** "לא שיניתי" first, then an account the check doubts, then new ones. */
const REVIEW_ORDER: Record<BankReview, number> = {
  disputed: 0,
  warned: 1,
  new: 2,
};

/**
 * The accounts to look at, from a holder's status rows (anyone else's have
 * no detail, so none): "לא שיניתי" first, then a number the bank's check
 * doubts, then new ones, by name within each (`names`, unnamed last).
 */
export function fileReviewsOf(
  statuses: readonly FileStatus[],
  names: ReadonlyMap<string, string | null> = new Map(),
): FileReview[] {
  const reviews: FileReview[] = [];
  for (const status of statuses) {
    const review = status.detail?.bank_review;
    if (review) reviews.push({ userId: status.user_id, review });
  }
  return orderFileReviews(reviews, names);
}

/** The accounts to look at in their order: by kind, then by name (unnamed last). */
export function orderFileReviews(
  reviews: readonly FileReview[],
  names: ReadonlyMap<string, string | null>,
): FileReview[] {
  const nameOf = (userId: string) => names.get(userId) ?? null;
  return [...reviews].sort((a, b) => {
    const kind = REVIEW_ORDER[a.review] - REVIEW_ORDER[b.review];
    if (kind !== 0) return kind;
    const one = nameOf(a.userId);
    const two = nameOf(b.userId);
    if (one === null || two === null) {
      return (one === null ? 1 : 0) - (two === null ? 1 : 0);
    }
    return one.localeCompare(two, "he");
  });
}

/**
 * What a minor's file reminds the business of (H6b-2, issue #82 §2.7): the
 * notice of the terms of work within a week of the start (`noticeBy`, null
 * without a start), whether that day is behind `today`, and whether they are
 * under 15, who may work only in the holidays. Null for an adult, and from
 * the 18th birthday (`youthUntil`) on. The age goes by the birth date, or
 * by the 18th birthday when the file holds none.
 */
export type MinorChecklist = {
  noticeBy: string | null;
  noticePassed: boolean;
  under15: boolean;
};

export function minorChecklistOf(
  birthDate: string | null,
  youthUntil: string | null,
  startedOn: string | null,
  today: string,
): MinorChecklist | null {
  if (youthUntil === null || youthUntil <= today) return null;
  const fifteenth = birthDate
    ? `${Number(birthDate.slice(0, 4)) + 15}${birthDate.slice(4)}`
    : `${Number(youthUntil.slice(0, 4)) - 3}${youthUntil.slice(4)}`;
  const noticeBy = startedOn ? addDays(startedOn, 7) : null;
  return {
    noticeBy,
    noticePassed: noticeBy !== null && noticeBy < today,
    under15: today < fifteenth,
  };
}

/** The team's filter of the files (H6b-2): everyone, files missing details, an open 101. */
export const FILE_FILTERS = ["all", "missing", "form101"] as const;
export type FileFilter = (typeof FILE_FILTERS)[number];
export type FileTag = Exclude<FileFilter, "all">;

/**
 * Which of the filter's choices a file shows under, from what the reader
 * sees: missing anything; this year's 101 open while the business takes it
 * in the app, which for a holder is none yet, returned or an updated one
 * due, and for anyone else not in.
 */
export function fileFilterTags(
  status: FileStatus,
  form101: boolean,
): FileTag[] {
  const tags: FileTag[] = [];
  if (!status.complete) tags.push("missing");
  if (form101) {
    const open = status.detail
      ? status.detail.status === null ||
        status.detail.status === "returned" ||
        status.detail.status === "change_due"
      : !status.form101_in;
    if (open) tags.push("form101");
  }
  return tags;
}
