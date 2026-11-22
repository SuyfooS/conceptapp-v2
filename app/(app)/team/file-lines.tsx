import type { FileGroup, FileStatus } from "@domain/employee-file";
import { fileLineOf, form101LineOf } from "@domain/file-holders";
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
 * detail. The same words in every shape.
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

/** The line under a person: the file, an account to look at, this year's 101. */
export function fileLineWords(
  t: T,
  format: Format,
  status: FileStatus,
  files: Pick<TeamFiles, "form101">,
): ReactNode {
  const line = fileLineOf(status);
  const parts: [string, ReactNode][] = [
    [
      "file",
      line.kind === "complete"
        ? t("team.file.line.complete")
        : line.kind === "groups"
          ? t("team.file.line.missingGroups", {
              groups: groupsWords(t, format, line.groups),
            })
          : t("team.file.line.missingCount", { count: line.count }),
    ],
  ];
  if (line.kind !== "count" && line.bankReview) {
    parts.push(["bank", t("team.file.line.bankReview")]);
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

/** The desktop table's two cells: the details for payroll, and this year's 101. */
export function fileCells(
  t: T,
  format: Format,
  status: FileStatus,
): { details: ReactNode; form101: ReactNode } {
  const line = fileLineOf(status);
  const details =
    line.kind === "complete"
      ? t("team.file.cells.complete")
      : line.kind === "groups"
        ? t("team.file.cells.missingGroups", {
            groups: groupsWords(t, format, line.groups),
          })
        : t("team.file.cells.missingCount", { count: line.count });
  const form = form101LineOf(status);
  return {
    details:
      line.kind !== "count" && line.bankReview ? (
        <>
          {details}
          <span className="block text-sm text-warning">
            {t("team.file.line.bankReview")}
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
