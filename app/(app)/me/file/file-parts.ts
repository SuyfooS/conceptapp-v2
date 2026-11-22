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
 * A fund still to choose, when that is all the file lacks
 * (`onlyPensionLeft`): by its day, or with the day passed. Null otherwise.
 * The ways in that ask to complete the file (Today's card, the profile's)
 * then open the pension's step and say so, rather than the flow's done
 * screen.
 */
export function pensionLeftOf(data: FileScreenData): PensionDue | null {
  return onlyPensionLeft(
    data.missing,
    fileStepStates(fileStepInputOf(data)),
    data.steps,
  )
    ? pensionDue(data.pensionDueOn, data.today)
    : null;
}

/** Where a way in that asks to complete the file opens it: the pension's step when only a fund is left. */
export function completeHref(base: string, pensionLeft: PensionDue | null) {
  return pensionLeft ? `${base}/me/file?step=pension` : `${base}/me/file`;
}
