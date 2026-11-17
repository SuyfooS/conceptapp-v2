import type {
  Attendance,
  BreakProblem,
  BreakRecord,
  ConfirmRow,
  EntryProblem,
  ShiftRecord,
} from "@domain/time-clock";

/**
 * An entry waiting for this viewer's approval, as the confirm card lists it:
 * what waits and the time it names come from `confirmRowOf`.
 */
export type EntryToConfirm = ConfirmRow & {
  entryId: string;
  userId: string;
  name: string | null;
  /** The business day it began on. */
  date: string;
};

export type TeamHoursData = {
  /** The month shown, `YYYY-MM`. */
  month: string;
  currentMonth: string;
  /** Everyone's minutes and shifts in the month. */
  minutes: number;
  shifts: number;
  /** The business asks for a code to clock in and out. */
  required: boolean;
  /** The code can be shown on this person's phone: the header's action. */
  showCode: boolean;
  /** Someone from ConceptApp is looking; nothing can be pressed. */
  viewOnly: boolean;
  /** They hold pay access: the way to the hours for payroll. */
  payroll: boolean;
  /** What this viewer may approve, oldest first. */
  toConfirm: EntryToConfirm[];
  atWork: {
    userId: string;
    name: string | null;
    since: string;
    onBreak: boolean;
    /** The month its shift belongs to, which may be the one before. */
    month: string;
    /** How their entry was recorded so far. */
    attendance: Attendance | null;
  }[];
  /** Open for longer than an entry can be, wherever the month shown is. */
  overdue: {
    entryId: string;
    userId: string;
    name: string | null;
    /** The business day it began on. */
    date: string;
    in: string;
  }[];
  people: {
    userId: string;
    name: string | null;
    former: boolean;
    minutes: number;
    shifts: number;
    breakMinutes: number;
  }[];
};

export type PersonHoursData = {
  person: { userId: string; name: string | null };
  month: string;
  currentMonth: string;
  minutes: number;
  records: ShiftRecord[];
  /** The business's date today, to start a new shift from. */
  today: string;
  /** A break added now comes off the hours (the clock's `unpaidBreaks`). */
  unpaidBreaks: boolean;
  viewOnly: boolean;
};

export type EntryFailure =
  | EntryProblem
  | BreakProblem
  | "times"
  /** Why the hours change is missing: the database keeps one for each. */
  | "reasonNeeded"
  /** Someone else approves a person's own hours. */
  | "ownHours"
  /** Hours someone set for themselves wait for an owner. */
  | "ownerOnly"
  /** Someone already cancelled the shift: it comes back before it changes. */
  | "cancelled"
  /** Someone already brought the shift back. */
  | "notCancelled"
  /** Only an owner cancels their own shift, or brings it back. */
  | "ownShift"
  /** Bringing it back: a live shift of the person covers those hours now. */
  | "overlap"
  /** Cancelling one still open: a break after its first day; its end is fixed first. */
  | "breaksAfterDay"
  /** Bringing back one a cancel ended: the person is off the staff now. */
  | "notOnStaff"
  /** A break edit: another break of the shift covers that time. */
  | "breakOverlap"
  /** A break edit: the break is still running. */
  | "breakOpen"
  /** A break edit: the break was removed, or cut away, meanwhile. */
  | "breakGone"
  /** Only an owner edits the breaks of their own shift. */
  | "ownBreaks"
  /** Taking a removed break back: its ten minutes passed. */
  | "tooLate"
  | "noAccess"
  | "viewOnly"
  | "failed";

export type EntryActionResult =
  | { ok: true }
  | { ok: false; failure: EntryFailure };

/** What was typed for a break, HH:MM, with why it changes. */
export type BreakValues = {
  start: string;
  end: string;
  reason: string;
};

/** What was typed for a shift, as the form holds it, with why it changes. */
export type EntryValues = {
  date: string;
  in: string;
  out: string;
  reason: string;
};

export type EntryActions = {
  correct: (entryId: string, values: EntryValues) => Promise<EntryActionResult>;
  add: (personId: string, values: EntryValues) => Promise<EntryActionResult>;
  /** Cancel a shift, with why: it stays, marked, and counts for nothing. */
  cancel: (entryId: string, reason: string) => Promise<EntryActionResult>;
  /** Bring a cancelled shift back as it was; the toast's "ביטול" too. */
  restore: (entryId: string) => Promise<EntryActionResult>;
  /** Add a break the shift is missing, with why. */
  addBreak: (
    entryId: string,
    values: BreakValues,
  ) => Promise<EntryActionResult>;
  /** Change the times of one of the shift's breaks that ended, with why. */
  changeBreak: (
    entryId: string,
    breakId: string,
    values: BreakValues,
  ) => Promise<EntryActionResult>;
  /** Remove a break pressed by mistake, with why: it is marked, and kept. */
  removeBreak: (breakId: string, reason: string) => Promise<EntryActionResult>;
  /** Take a removal back: the toast's "ביטול", within ten minutes. */
  restoreBreak: (breakId: string) => Promise<EntryActionResult>;
};

/**
 * What the person's sheet is open on: a shift to add, one to fix, the step
 * that cancels it, one cancelled, to bring back, or the step that fixes one
 * of its breaks (`pause`), or adds one (null).
 */
export type EntryTarget =
  | { kind: "add" }
  | { kind: "edit"; record: ShiftRecord }
  | { kind: "cancel"; record: ShiftRecord }
  | { kind: "cancelled"; record: ShiftRecord }
  | { kind: "break"; record: ShiftRecord; pause: BreakRecord | null };

/** What the team's screen can do. The demo passes a stand-in. */
export type TeamActions = {
  confirm: (entryId: string) => Promise<EntryActionResult>;
};

/** Where this screen's links go; the demo keeps them inside the demo. */
export type TeamPaths = {
  clock: string;
  team: string;
  code: string;
  /** The hours for payroll, for those who hold pay access. */
  pay: string;
};
