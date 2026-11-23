import type { BankReview, FileGroup, FileStatus } from "@domain/employee-file";
import { type FileLine, fileLineOf, form101LineOf } from "@domain/file-holders";
import type { createFormatter } from "next-intl";
import { Fragment, type ReactNode } from "react";
import type { Translator } from "../wording";
import type { TeamFiles } from "./file-status";

/*
 * The hiring file's status in words, for the team's screens (profile H6a):
 * the line under a person on a phone and a tablet, the desktop table's two
 * cells, and a person's card. A holder's words name what is missing ("חסר
 * בתיק: חשבון בנק ופנסיה"), an account to look at and this year's 101 as it
 * stands; anyone else's only count ("חסרים 2 פרטים לשכר") and say whether
 * the 101 is in, since `fileLineOf` gives no group without the holder's
 * detail. The same words in every shape: the table's details cell says
 * what the line says, and its 101 cell the line's status, under a column
 * named for the form and the year as the line names them. The person's
 * own "לא שיניתי" on the account is said apart from a change to look at
 * (H6b-1): it asks the holder to check with them first. The desktop's
 * "שינוי אחרון" (H6b-2) is the day the file or its 101 was last written.
 */

type T = Translator<"app">;
export type Format = ReturnType<typeof createFormatter>;

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/** The groups as one phrase, in FILE_GROUPS' order ("חשבון בנק ופנסיה"). */
export function groupsWords(
  t: T,
  format: Format,
  groups: readonly FileGroup[],
): string {
  return format.list(
    groups.map((group) => t(`team.file.groups.${group}`)),
    { type: "conjunction" },
  );
}

/** A day (`YYYY-MM-DD`) as a line writes it ("1.12"). */
function shortDay(format: Format, day: string): string {
  return format.dateTime(new Date(`${day}T12:00:00Z`), {
    day: "numeric",
    month: "numeric",
    timeZone: "UTC",
  });
}

/** Parts joined by " · ", each by its name. */
function joined(parts: [string, ReactNode][]): ReactNode {
  return parts.map(([key, part], at) => (
    <Fragment key={key}>
      {at > 0 ? " · " : null}
      {part}
    </Fragment>
  ));
}

/** The account to look at: the person's "לא שיניתי", or a change to check. */
function reviewWords(t: T, review: BankReview) {
  return review === "disputed"
    ? t("team.file.line.bankDisputed")
    : t("team.file.line.bankReview");
}

/** What the file lacks, or that it is complete: the line's first part, and the table's cell. */
function fileWords(t: T, format: Format, line: FileLine): string {
  return line.kind === "complete"
    ? t("team.file.line.complete")
    : line.kind === "groups"
      ? t("team.file.line.missingGroups", {
          groups: groupsWords(t, format, line.groups),
        })
      : t("team.file.line.missingCount", { count: line.count });
}

/** The line under a person: the file, an account to look at, this year's 101. */
export function fileLineWords(
  t: T,
  format: Format,
  status: FileStatus,
  files: Pick<TeamFiles, "form101">,
): ReactNode {
  const line = fileLineOf(status);
  const parts: [string, ReactNode][] = [["file", fileWords(t, format, line)]];
  if (line.kind !== "count" && line.bankReview) {
    parts.push(["bank", reviewWords(t, line.bankReview)]);
  }
  if (files.form101) {
    const form = form101LineOf(status);
    parts.push([
      "form101",
      form.kind === "holder"
        ? t.rich("team.file.line.form101Holder", {
            year: form.year,
            status: form.status ?? "none",
            date: form.changeDueBy ? shortDay(format, form.changeDueBy) : "",
            ltr,
          })
        : t("team.file.line.form101Team", {
            state: form.in ? "in" : "missing",
          }),
    ]);
  }
  return joined(parts);
}

/**
 * The desktop's "שינוי אחרון" for a holder (H6b-2): the day the file or its
 * 101 was last written, by anyone, or that nothing was filled yet.
 */
export function changedCell(
  t: T,
  format: Format,
  status: FileStatus,
  timeZone: string,
): ReactNode {
  const at = status.detail?.changed_at ?? null;
  return at === null ? (
    <span className="text-ink-2">{t("team.file.cells.neverChanged")}</span>
  ) : (
    <span dir="ltr">
      {format.dateTime(new Date(at), {
        day: "numeric",
        month: "numeric",
        year: "numeric",
        timeZone,
      })}
    </span>
  );
}

/**
 * The desktop table's two cells: the details for payroll in the line's own
 * words, and this year's 101, whose column already says which form and year.
 */
export function fileCells(
  t: T,
  format: Format,
  status: FileStatus,
): { details: ReactNode; form101: ReactNode } {
  const line = fileLineOf(status);
  const details = fileWords(t, format, line);
  const form = form101LineOf(status);
  return {
    details:
      line.kind !== "count" && line.bankReview ? (
        <>
          {details}
          <span className="block text-sm text-warning">
            {reviewWords(t, line.bankReview)}
          </span>
        </>
      ) : (
        details
      ),
    form101:
      form.kind === "holder"
        ? t.rich("team.file.cells.form101", {
            status: form.status ?? "none",
            date: form.changeDueBy ? shortDay(format, form.changeDueBy) : "",
            ltr,
          })
        : t("team.file.cells.form101", {
            status: form.in ? "in" : "missing",
            date: "",
          }),
  };
}
