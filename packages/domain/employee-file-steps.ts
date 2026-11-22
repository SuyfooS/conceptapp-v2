import type {
  FileGroup,
  FileRow,
  Form101Route,
  PensionAnswer,
  TaxYearStatus,
} from "./employee-file";
import type { FileAsks, Form101Way } from "./employee-file-settings";
import type { AddressForm } from "./profile";
import { youthUntilOf } from "./youth";

/*
 * The worker's own hiring file as a flow (profile H5a, /me/file): how to be
 * addressed, then a step for each group the business asks, then Form 101.
 * Which steps show is the business's settings' (H5b): the address step and
 * the bank's while asked, or while the file holds what they keep, so it can
 * be seen and changed; Form 101's unless it isn't taken in the app. Where
 * each step stands is worked out from the file, never ticked, so the
 * phone's bar, the tablet's list and the desktop's summary always agree,
 * and the person comes back to the first step still open. Every helper
 * below takes the steps on screen (`fileStepsOn`); all six by default.
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

/**
 * Done, still open, handed to payroll directly (a holder's mark), or not
 * asked of the person at all and nothing given yet (`optional`: step 2 when
 * the business asks only for ways to reach them, counted by `stepsDone`
 * only once something of it is in, when it is done).
 */
export type StepState = "done" | "open" | "direct" | "optional";

/** The step each group of the file is filled in. */
export const STEP_OF_GROUP: Record<FileGroup, FileStep> = {
  identity: "identity",
  address: "address",
  bank: "bank",
  pension: "pension",
};

/**
 * What the flow shows: what the business asks, or what the file holds
 * already, which the person can still see, change or delete (H5b's default
 * 4). The email is never asked on its own: it shows with step 2, and keeps
 * that step on screen while the file holds one.
 */
export type FileParts = {
  address: boolean;
  email: boolean;
  bank: boolean;
  workLanguage: boolean;
  emergency: boolean;
  form101: boolean;
};

export function fileParts(input: {
  asks: FileAsks;
  way: Form101Way;
  held: {
    address: boolean;
    email: boolean;
    bank: boolean;
    workLanguage: boolean;
    emergency: boolean;
  };
}): FileParts {
  const { asks, held } = input;
  return {
    address: asks.address || held.address,
    email: held.email,
    bank: asks.bank || held.bank,
    workLanguage: asks.workLanguage || held.workLanguage,
    emergency: asks.emergencyContact || held.emergency,
    form101: input.way !== "off",
  };
}

/**
 * The steps on screen, in FILE_STEPS' order: step 2 while any of its parts
 * shows, the bank's while it does, Form 101's unless it is off.
 */
export function fileStepsOn(parts: FileParts): FileStep[] {
  return FILE_STEPS.filter((step) => {
    switch (step) {
      case "address":
        return (
          parts.address || parts.email || parts.workLanguage || parts.emergency
        );
      case "bank":
        return parts.bank;
      case "form101":
        return parts.form101;
      default:
        return true;
    }
  });
}

/** The step a page's `?step=` names, or null for none it knows or none on screen. */
export function fileStepOf(
  param: unknown,
  steps: readonly FileStep[] = FILE_STEPS,
): FileStep | null {
  return steps.find((step) => step === param) ?? null;
}

const place = (step: FileStep) => FILE_STEPS.indexOf(step);

/** The step on screen after this one, or null after the last. */
export function nextFileStep(
  step: FileStep,
  steps: readonly FileStep[] = FILE_STEPS,
): FileStep | null {
  return steps.find((other) => place(other) > place(step)) ?? null;
}

/** The step on screen before this one, or null before the first. */
export function previousFileStep(
  step: FileStep,
  steps: readonly FileStep[] = FILE_STEPS,
): FileStep | null {
  return steps.findLast((other) => place(other) < place(step)) ?? null;
}

export type FileStepInput = {
  /** The profile's form of address: chosen once, here or on /me. */
  addressForm: AddressForm | null;
  /** The groups the business asks (`fileGroupsAsked`). */
  asked: readonly FileGroup[];
  /** The groups still missing, as the database counts them. */
  missing: readonly FileGroup[];
  /** The groups a holder marked "נמסר ישירות לשכר". */
  directGroups: readonly FileGroup[];
  pensionAnswer: PensionAnswer | null;
  /** This year's Form 101, or null before anything was marked. */
  form101: { status: TaxYearStatus; route: Form101Route | null } | null;
  /**
   * Something of step 2 is in though the address isn't asked: the address
   * itself, the email, the work language or the emergency contact.
   */
  contactHeld: boolean;
};

/**
 * Where each step stands. A group the business doesn't ask is done; one
 * handed directly is `direct`. Step 2 without the address asked is
 * `optional` until something of it is in, then done. "אבחר אחר כך" answers
 * the pension step here, though the file still counts the pension missing
 * until a fund is chosen. Form 101 is done once handed in or accepted, and
 * open while it is missing, returned or due again after a change.
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
  const address = group("address");
  return {
    start: input.addressForm === null ? "open" : "done",
    identity: group("identity"),
    address:
      address === "done" &&
      !input.asked.includes("address") &&
      !input.contactHeld
        ? "optional"
        : address,
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

/**
 * How many of the steps on screen are behind the person: done or handed
 * directly. An optional step counts once something of it is in (it is
 * done then), never before: a new worker's "0 מתוך 4 צעדים" agrees with
 * the list, where that step's row is still open, "לא חובה".
 */
export function stepsDone(
  states: Record<FileStep, StepState>,
  steps: readonly FileStep[] = FILE_STEPS,
): number {
  return steps.filter(
    (step) => states[step] === "done" || states[step] === "direct",
  ).length;
}

/**
 * A fund still to choose is all the file lacks: the pension is the only
 * group the database counts missing, though "אבחר אחר כך" put its step
 * behind the person, and no step on screen is open. The flow, with nothing
 * open, opens on its done screen, so the ways in that ask to complete a
 * file already sent (Today's card, the profile's) open the pension's step
 * instead and say that is what is left (H5b); one not sent yet is sent from
 * that done screen first.
 */
export function onlyPensionLeft(
  missing: readonly FileGroup[],
  states: Record<FileStep, StepState>,
  steps: readonly FileStep[] = FILE_STEPS,
): boolean {
  return (
    missing.length === 1 &&
    missing[0] === "pension" &&
    resumeStep(states, steps) === "done"
  );
}

/**
 * The steps a file is sent with: the details payroll needs. Step 0 is the
 * profile's, and Form 101 is handed in on paper, so neither keeps it back.
 */
export const SENT_WITH = [
  "identity",
  "address",
  "bank",
  "pension",
] as const satisfies readonly FileStep[];

/**
 * What keeps the file from being sent: the first of its details on screen
 * still open, which the send action leads to instead, or null once it can
 * go. An optional step never does.
 */
export function sendBlocker(
  states: Record<FileStep, StepState>,
  steps: readonly FileStep[] = FILE_STEPS,
): (typeof SENT_WITH)[number] | null {
  return (
    SENT_WITH.find((step) => steps.includes(step) && states[step] === "open") ??
    null
  );
}

/** Where the person picks up: the first step on screen still open, or done. */
export function resumeStep(
  states: Record<FileStep, StepState>,
  steps: readonly FileStep[] = FILE_STEPS,
): FileStep | "done" {
  return steps.find((step) => states[step] === "open") ?? "done";
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
