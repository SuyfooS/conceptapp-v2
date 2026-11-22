import type {
  FileGroup,
  FileRow,
  Form101Route,
  PensionAnswer,
  TaxYearStatus,
} from "./employee-file";
import type { AddressForm } from "./profile";
import { youthUntilOf } from "./youth";

/*
 * The worker's own hiring file as a flow (profile H5a, /me/file): how to be
 * addressed, then a step for each group the business asks, then Form 101.
 * Where each step stands is worked out from the file, never ticked, so the
 * phone's bar, the tablet's list and the desktop's summary always agree, and
 * the person comes back to the first step still open.
 */

export const FILE_STEPS = [
  "start",
  "identity",
  "address",
  "bank",
  "pension",
  "form101",
] as const;
export type FileStep = (typeof FILE_STEPS)[number];

/** Done, still open, or handed to payroll directly (a holder's mark). */
export type StepState = "done" | "open" | "direct";

/** The step each group of the file is filled in. */
export const STEP_OF_GROUP: Record<FileGroup, FileStep> = {
  identity: "identity",
  address: "address",
  bank: "bank",
  pension: "pension",
};

/** The step a page's `?step=` names, or null for none it knows. */
export function fileStepOf(param: unknown): FileStep | null {
  return FILE_STEPS.find((step) => step === param) ?? null;
}

/** The step after this one, or null after the last. */
export function nextFileStep(step: FileStep): FileStep | null {
  return FILE_STEPS[FILE_STEPS.indexOf(step) + 1] ?? null;
}

/** The step before this one, or null before the first. */
export function previousFileStep(step: FileStep): FileStep | null {
  const at = FILE_STEPS.indexOf(step);
  return at > 0 ? (FILE_STEPS[at - 1] ?? null) : null;
}

export type FileStepInput = {
  /** The profile's form of address: chosen once, here or on /me. */
  addressForm: AddressForm | null;
  /** The groups the business asks (every one until H5b's settings). */
  asked: readonly FileGroup[];
  /** The groups still missing, as the database counts them. */
  missing: readonly FileGroup[];
  /** The groups a holder marked "נמסר ישירות לשכר". */
  directGroups: readonly FileGroup[];
  pensionAnswer: PensionAnswer | null;
  /** This year's Form 101, or null before anything was marked. */
  form101: { status: TaxYearStatus; route: Form101Route | null } | null;
};

/**
 * Where each step stands. A group the business doesn't ask is done; one
 * handed directly is `direct`. "אבחר אחר כך" answers the pension step here,
 * though the file still counts the pension missing until a fund is chosen.
 * Form 101 is done once handed in or accepted, and open while it is
 * missing, returned or due again after a change.
 */
export function fileStepStates(
  input: FileStepInput,
): Record<FileStep, StepState> {
  const group = (name: FileGroup): StepState => {
    if (input.directGroups.includes(name)) return "direct";
    if (!input.asked.includes(name)) return "done";
    if (name === "pension" && input.pensionAnswer === "later") return "done";
    return input.missing.includes(name) ? "open" : "done";
  };
  const form101 = input.form101;
  return {
    start: input.addressForm === null ? "open" : "done",
    identity: group("identity"),
    address: group("address"),
    bank: group("bank"),
    pension: group("pension"),
    form101:
      form101 === null
        ? "open"
        : form101.status === "handed_in" || form101.status === "accepted"
          ? form101.route === "direct"
            ? "direct"
            : "done"
          : "open",
  };
}

/** How many steps are behind the person: done, or handed directly. */
export function stepsDone(states: Record<FileStep, StepState>): number {
  return FILE_STEPS.filter((step) => states[step] !== "open").length;
}

/** Where the person picks up: the first step still open, or done. */
export function resumeStep(
  states: Record<FileStep, StepState>,
): FileStep | "done" {
  return FILE_STEPS.find((step) => states[step] === "open") ?? "done";
}

/**
 * Nothing in the file yet, so the flow opens on its welcome: no row, or one
 * with nothing the person or a holder put in it.
 */
export function isNewFile(file: FileRow | null): boolean {
  return (
    file === null ||
    (file.legal_first_name === null &&
      file.legal_last_name === null &&
      file.birth_date === null &&
      file.id_kind === null &&
      file.city_code === null &&
      !file.has.address &&
      !file.has.email &&
      !file.has.bank_account &&
      file.pension_answer === null &&
      file.direct_groups.length === 0 &&
      file.submitted_at === null)
  );
}

/**
 * Whether a birth date as typed makes the person a minor today, so the
 * screen asks for the medical certificate before they start work (the Youth
 * Labor Law), as soon as the date is in.
 */
export function minorOnFile(birthDate: string | null, today: string): boolean {
  return birthDate !== null && youthUntilOf(birthDate, today) !== null;
}

/** The time to choose a pension fund: open until a day, passed, or none to say. */
export type PensionDue =
  | { kind: "open"; dueOn: string }
  | { kind: "passed" }
  | { kind: "none" };

/**
 * `pension_due_on` (60 days from the start of the work, while no fund is
 * chosen) as the screen says it on `today`: the last day to choose, through
 * that day itself, or passed.
 */
export function pensionDue(dueOn: string | null, today: string): PensionDue {
  if (dueOn === null) return { kind: "none" };
  return dueOn >= today ? { kind: "open", dueOn } : { kind: "passed" };
}

/**
 * The last four digits of the person's own number, for "שלחנו קוד למספר
 * שמסתיים ב-": never more of it on screen. Null without a number.
 */
export function phoneTail(phone: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}
