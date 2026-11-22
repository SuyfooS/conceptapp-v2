import type { FileRow } from "@domain/employee-file";
import {
  type EmployeeFileSettings,
  fileAsksOf,
  fileGroupsAsked,
  form101SetupOf,
  noticeNamesOf,
} from "@domain/employee-file-settings";
import {
  type FileStepInput,
  fileParts,
  fileStepStates,
  fileStepsOn,
  onlyPensionLeft,
  type PensionDue,
  pensionDue,
} from "@domain/employee-file-steps";
import type { Translator } from "../../wording";
import type { FileScreenData } from "./file-types";

/*
 * What a business's settings make of a person's file (profile H5b): what is
 * asked, what shows (asked, or held already, so it can be changed or
 * deleted), the steps on screen, Form 101's way and the notice's names. The
 * same for the app's read (`currentFileScreen`) and the twin's mock files.
 */

export type FileSettingsParts = Pick<
  FileScreenData,
  "asks" | "asked" | "parts" | "steps" | "form101" | "notice"
>;

export function fileSettingsParts(
  settings: EmployeeFileSettings,
  file: FileRow | null,
  emergency: boolean,
): FileSettingsParts {
  const asks = fileAsksOf(settings);
  const form101 = form101SetupOf(settings);
  const parts = fileParts({
    asks,
    way: form101.way,
    held: {
      address: file?.has.address ?? false,
      email: file?.has.email ?? false,
      bank: file?.has.bank_account ?? false,
      workLanguage: file?.has.work_language ?? false,
      emergency,
    },
  });
  return {
    asks,
    asked: fileGroupsAsked(asks),
    parts,
    steps: fileStepsOn(parts),
    form101,
    notice: noticeNamesOf(settings),
  };
}

/** What the steps' states are worked out from, for the file on screen. */
export function fileStepInputOf(data: FileScreenData): FileStepInput {
  const file = data.file;
  return {
    addressForm: data.addressForm,
    asked: data.asked,
    missing: data.missing,
    directGroups: file?.direct_groups ?? [],
    pensionAnswer: file?.pension_answer ?? null,
    form101: data.taxYear
      ? { status: data.taxYear.status, route: data.taxYear.route }
      : null,
    contactHeld:
      (file?.has.address ?? false) ||
      (file?.has.email ?? false) ||
      (file?.has.work_language ?? false) ||
      data.emergency !== null,
  };
}

/**
 * A fund still to choose, when that is all a sent file lacks
 * (`onlyPensionLeft`): by its day, or with the day passed. Null otherwise.
 * The ways in that ask to complete the file (Today's card, the profile's)
 * then open the pension's step and say so, rather than the flow's done
 * screen. Not sent yet, the file still has to go: they keep "השלמת
 * הפרטים" to the flow, whose done screen sends it first.
 */
export function pensionLeftOf(data: FileScreenData): PensionDue | null {
  if (data.file?.submitted_at == null) return null;
  return onlyPensionLeft(
    data.missing,
    fileStepStates(fileStepInputOf(data)),
    data.steps,
  )
    ? pensionDue(data.pensionDueOn, data.today)
    : null;
}

/**
 * A fund chosen "later" that the file still counts missing, though the
 * pension's step is behind the person: by its day, with the day passed
 * (`private.pension_due_on` keeps the day for a "later" answer), or with
 * none to say. Null once a real answer is in. The flow says it in each of
 * these on the pension's row, in a desktop's summary and on its done
 * screen, which is never "סיימת" while it is left, as Today's card and the
 * profile's say it (`completeWords`).
 */
export function pensionLaterOf(data: FileScreenData): PensionDue | null {
  return data.file?.pension_answer === "later" &&
    data.missing.includes("pension")
    ? pensionDue(data.pensionDueOn, data.today)
    : null;
}

/**
 * What a way in that asks to complete the file says (Today's card, the
 * profile's): a fund still to choose by its day, or with its day passed,
 * when that is all a sent file lacks (`pensionLeftOf`); else how much is
 * missing. The same words in both places, so neither says what the other
 * doesn't.
 */
export function completeWords(
  t: Translator<"app">,
  missing: number,
  pension: PensionDue | null,
  day: (date: string) => string,
): string {
  return pension?.kind === "open"
    ? t("me.file.pensionLeft", { date: day(pension.dueOn) })
    : pension?.kind === "passed"
      ? t("me.file.pensionPassed")
      : t("me.file.missing", { count: missing });
}

/**
 * Where a way in that asks to complete the file opens it: the pension's
 * step when only a fund is left. `query` is a twin's own (the state of the
 * file it told), carried to the file's twin.
 */
export function completeHref(
  base: string,
  pensionLeft: PensionDue | null,
  query = "",
) {
  const params = [pensionLeft ? "step=pension" : "", query].filter(Boolean);
  return `${base}/me/file${params.length > 0 ? `?${params.join("&")}` : ""}`;
}
