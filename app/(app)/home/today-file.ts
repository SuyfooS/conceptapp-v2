import type { ModuleNavEntry } from "@domain/modules";
import type { FileToday } from "../me/file/file-types";

/**
 * The hiring file's part of Today (profile H5b), decided from what Today
 * read: the file only while its module brings a part (`moduleWidgets`); its
 * card while anything is missing, for anyone the file counts (never an
 * owner), in the screen's one accent unless something above holds it (the
 * owner's first steps, an open mode); else its quiet row, which says the
 * file is complete once nothing is missing.
 */
export function todayFilePart({
  widgets,
  file,
  accentTaken,
}: {
  widgets: readonly ModuleNavEntry[];
  file: FileToday | null | undefined;
  accentTaken: boolean;
}): {
  file: FileToday | null;
  card: "accent" | "flat" | null;
  complete: boolean;
} {
  const shown = widgets.some((w) => w.key === "employee_files")
    ? (file ?? null)
    : null;
  const card =
    shown !== null && shown.missing > 0 && shown.role !== "owner"
      ? accentTaken
        ? "flat"
        : "accent"
      : null;
  return { file: shown, card, complete: shown?.missing === 0 };
}
